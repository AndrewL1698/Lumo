// Hard never-list (specs §5.1, architecture §6). Enforced in code even when the user has
// granted the origin, so a mistaken allowlist entry still cannot turn Parrot on here.
// Checked in two places: the service worker before registering a content script, and the
// content script before it touches the DOM.

/** Hostname is this domain or a subdomain of it. */
function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

const BLOCKED_DOMAINS: ReadonlyArray<readonly [string, string]> = [
  // email
  ["mail.google.com", "email"],
  ["outlook.com", "email"],
  ["outlook.live.com", "email"],
  ["office.com", "email"],
  ["mail.yahoo.com", "email"],
  ["proton.me", "email"],
  ["protonmail.com", "email"],
  ["zoho.com", "email"],
  // chat / messaging
  ["slack.com", "chat"],
  ["discord.com", "chat"],
  ["messenger.com", "chat"],
  ["whatsapp.com", "chat"],
  ["telegram.org", "chat"],
  ["teams.microsoft.com", "chat"],
  ["chat.google.com", "chat"],
  ["messages.google.com", "chat"],
  ["signal.org", "chat"],
  // banking / payments
  ["chase.com", "banking"],
  ["wellsfargo.com", "banking"],
  ["bankofamerica.com", "banking"],
  ["citi.com", "banking"],
  ["capitalone.com", "banking"],
  ["americanexpress.com", "banking"],
  ["discover.com", "banking"],
  ["paypal.com", "payments"],
  ["venmo.com", "payments"],
  ["stripe.com", "payments"],
  ["coinbase.com", "payments"],
  ["robinhood.com", "banking"],
  ["fidelity.com", "banking"],
  ["schwab.com", "banking"],
  // health / insurance
  ["mychart.com", "health"],
  ["cigna.com", "health"],
  ["aetna.com", "health"],
  ["unitedhealthcare.com", "health"],
  ["kaiserpermanente.org", "health"],
  ["cvs.com", "health"],
  ["walgreens.com", "health"],
  ["goodrx.com", "health"],
  // school / work tools
  ["docs.google.com", "work tool"],
  ["drive.google.com", "work tool"],
  ["accounts.google.com", "login"],
  ["github.com", "work tool"],
  ["gitlab.com", "work tool"],
  ["overleaf.com", "work tool"],
  ["instructure.com", "school tool"],
  ["blackboard.com", "school tool"],
  ["gradescope.com", "school tool"],
  ["piazza.com", "school tool"],
  ["notion.so", "work tool"],
  ["atlassian.net", "work tool"],
  ["figma.com", "work tool"],
  ["zoom.us", "work tool"],
];

/** Subdomain prefixes that mean "this is infrastructure, not reading material". */
const BLOCKED_SUBDOMAIN_PREFIXES = ["mail.", "webmail.", "login.", "signin.", "auth.", "sso.", "account.", "accounts.", "secure.", "banking.", "canvas.", "portal.", "my."];

/**
 * Substrings in the HOSTNAME that imply money or medical records. Hostname only — an article
 * about home insurance is fine to read, a domain with "insurance" in it is not.
 *
 * Over-blocking is the safe direction here (Parrot just declines to run), so loose matches like
 * "bank" catching bankrate.com are fine. Deliberately NOT in this list: "hospital", because it is
 * a prefix of "hospitality" and would block travel and restaurant reading; and "clinic", because
 * it would block clinicaltrials.gov. Patient portals are still caught by "mychart", "patient",
 * "healthcare" and the exact-domain list above.
 */
const BLOCKED_HOST_WORDS = ["bank", "credit-union", "creditunion", "insurance", "healthcare", "medicaid", "medicare", "patient", "mychart"];

/** Single path segments that mean a login, checkout or account form. */
const BLOCKED_PATH_WORDS = ["login", "signin", "signup", "register", "checkout", "payment", "billing", "invoice", "password", "auth", "oauth", "sso", "2fa", "verify", "account"];

/** Two-word forms, matched after separators are normalised, so /sign-in and /sign_in both hit. */
const BLOCKED_PATH_PHRASES = ["sign-in", "sign-up", "log-in", "reset-password", "create-account"];

/**
 * URL-level never-list check.
 * @returns a short reason when the URL must never be touched, else null.
 */
export function neverListReason(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "not a URL";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not an http(s) page";

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  for (const [domain, reason] of BLOCKED_DOMAINS) {
    if (hostIs(host, domain)) return reason;
  }
  for (const prefix of BLOCKED_SUBDOMAIN_PREFIXES) {
    if (url.hostname.toLowerCase().startsWith(prefix)) return "login or account subdomain";
  }
  for (const word of BLOCKED_HOST_WORDS) {
    if (host.includes(word)) return "banking or health domain";
  }

  const segments = url.pathname.toLowerCase().split(/[/._-]+/).filter(Boolean);
  for (const word of BLOCKED_PATH_WORDS) {
    if (segments.includes(word)) return `${word} page`;
  }
  const joined = segments.join("-");
  for (const phrase of BLOCKED_PATH_PHRASES) {
    if (joined.includes(phrase)) return `${phrase} page`;
  }
  return null;
}

/**
 * Page-shape check, for login and form pages that no URL pattern catches.
 * A password field is the reliable signal; a search box is not.
 */
export function neverListPageReason(doc: Document): string | null {
  if (doc.querySelector('input[type="password"]')) return "page has a password field";
  return null;
}
