// Checks the course data (D-022): unit sizes, unique ids, every lemma in the word list, demo unit contents.
//   npm run check-curriculum -w scripts      (needs web/.env.local for the word list)
import "./build-wordlist/lib.ts"; // loads web/.env.local
import { UNITS } from "../web/lib/curriculum/units.ts";

const problems: string[] = [];
const ids = new Set<string>();
for (const u of UNITS) {
  if (ids.has(u.id)) problems.push(`duplicate id ${u.id}`);
  ids.add(u.id);
  if (u.words.length < 4 || u.words.length > 8) problems.push(`${u.id}: ${u.words.length} words (want 4 to 8)`);
  if (u.prompts.length !== 2) problems.push(`${u.id}: ${u.prompts.length} prompts (want 2)`);
}
const count = (l: string) => UNITS.filter((u) => u.level === l).length;
if (count("beginner") !== 5) problems.push("beginner needs 5 units (0..4)");
if (count("intermediate") !== 4) problems.push("intermediate needs 4 units");
if (count("upper_intermediate") !== 4) problems.push("upper_intermediate needs 4 units");

const int1 = UNITS.find((u) => u.id === "int-1");
for (const w of ["empresa", "mercado", "negocio", "mundo", "problema"])
  if (!int1?.words.includes(w)) problems.push(`int-1 must contain ${w} (demo)`);
if (!int1?.concept.errorTypes.includes("agreement")) problems.push("int-1 must count agreement errors (demo)");

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing (web/.env.local)");
const headers: Record<string, string> = { apikey: key };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
const all = [...new Set(UNITS.flatMap((u) => u.words))];
const list = encodeURIComponent(`(${all.map((l) => `"${l}"`).join(",")})`);
const res = await fetch(`${url}/rest/v1/words?select=lemma&lemma=in.${list}`, { headers });
if (!res.ok) throw new Error(`words query failed: ${res.status} ${await res.text()}`);
const found = new Set(((await res.json()) as { lemma: string }[]).map((r) => r.lemma));
for (const w of all) if (!found.has(w)) problems.push(`lemma not in the word list: ${w}`);

if (problems.length) {
  console.error("check-curriculum FAILED:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`check-curriculum ok: ${UNITS.length} units, ${all.length} distinct lemmas`);
