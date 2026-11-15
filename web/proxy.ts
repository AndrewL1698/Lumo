import { NextResponse, type NextRequest } from "next/server";

// Public-deploy guard (Next 16 "proxy", runs before every matched request).
// Only active when DEMO_ACCESS_KEY is set (the public deployment). Locally it is unset, so nothing changes.
//
// - Visiting any page with ?demo=<DEMO_ACCESS_KEY> once sets an httpOnly cookie for this browser (30 days).
// - API routes that cost money (Claude / ElevenLabs) and every API write (POST/PUT/DELETE) need that cookie,
//   so strangers can't spend our credits or change / delete the demo account's data.
// - Paid routes are also rate limited per visitor and per hour. In-memory per server instance: a speed bump,
//   not a billing guarantee.
// - Pages stay public; /tutor?mock=1 (rehearsal mode) makes no API calls, so it works for anyone.

const KEY = process.env.DEMO_ACCESS_KEY;
const COOKIE = "lumo_demo";
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 40); // paid requests per visitor per minute
const PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 1500); // paid requests per instance per hour

const PAID = [/^\/api\/tutor\//, /^\/api\/tts$/, /^\/api\/stt-/, /^\/api\/translate/];
const FREE_WRITES = new Set(["/api/tutor/metrics"]); // timing log only, still rate limited as paid
const isPaid = (path: string) => PAID.some((r) => r.test(path));

const perVisitor = new Map<string, number[]>();
let hourStart = Date.now();
let hourCount = 0;

function overLimit(ip: string): boolean {
  const now = Date.now();
  if (now - hourStart > 3_600_000) {
    hourStart = now;
    hourCount = 0;
    perVisitor.clear();
  }
  if (++hourCount > PER_HOUR) return true;
  const recent = (perVisitor.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  perVisitor.set(ip, recent);
  return recent.length > PER_MIN;
}

const json = (status: number, error: string) => NextResponse.json({ error }, { status });

export function proxy(req: NextRequest) {
  if (!KEY) return NextResponse.next(); // local / not deployed: no gate

  const { pathname, searchParams } = req.nextUrl;

  // ?demo=<key> on any page: remember this browser, then drop the key from the address bar.
  const given = searchParams.get("demo");
  if (given !== null) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete("demo");
    const res = NextResponse.redirect(clean);
    if (given === KEY) {
      res.cookies.set(COOKIE, KEY, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    }
    return res;
  }

  if (!pathname.startsWith("/api/") || req.method === "OPTIONS") return NextResponse.next();

  const paid = isPaid(pathname);
  const write = req.method !== "GET" && req.method !== "HEAD" && !FREE_WRITES.has(pathname);
  if (!paid && !write) return NextResponse.next(); // public reads

  // Refuse strangers first (costs nothing), so they can't use up the limit and lock the team out.
  if (req.cookies.get(COOKIE)?.value !== KEY) {
    return json(401, "This live demo's tutor is limited to our team. Try rehearsal mode at /tutor?mock=1.");
  }
  if (paid) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (overLimit(ip)) return json(429, "Too many requests. Please wait a minute and try again.");
  }
  return NextResponse.next();
}

export const config = {
  // API routes and pages; skip Next's own assets and files with an extension (images, icons).
  matcher: ["/api/:path*", "/((?!_next/|.*\\..*).*)"],
};
