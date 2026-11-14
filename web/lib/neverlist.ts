// Hard never-list (root CLAUDE.md rule 4): email, chat, banking, health, Docs/Canvas/GitHub, login and form pages.
// Enforced server-side even if the user allowlists them. This is the second guard: the extension's
// extension/src/neverlist.ts (Naren) is the first. Keep this list the UNION of both, and never stricter than the
// extension by accident, or the extension would swap on a page whose events the server then silently drops.
// Login/checkout PAGES (path words, password fields) are extension-only: the server never receives URLs.

// A host matches if it equals one of these or is a subdomain of it.
const DOMAINS = [
  // email
  "mail.google.com", "inbox.google.com", "outlook.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com",
  "office.com", "mail.yahoo.com", "proton.me", "protonmail.com", "zoho.com", "icloud.com", "fastmail.com",
  // chat / messaging
  "slack.com", "discord.com", "messenger.com", "whatsapp.com", "web.whatsapp.com", "telegram.org", "web.telegram.org",
  "teams.microsoft.com", "chat.google.com", "messages.google.com", "signal.org", "groupme.com",
  // banking / payments
  "chase.com", "wellsfargo.com", "bankofamerica.com", "citi.com", "capitalone.com", "americanexpress.com", "discover.com",
  "usbank.com", "pnc.com", "paypal.com", "venmo.com", "stripe.com", "coinbase.com", "robinhood.com", "fidelity.com",
  "schwab.com", "vanguard.com",
  // health / insurance
  "mychart.com", "mychart.org", "cigna.com", "aetna.com", "unitedhealthcare.com", "kaiserpermanente.org", "cvs.com",
  "walgreens.com", "goodrx.com", "healthcare.gov", "zocdoc.com", "patient.info",
  // school / work tools / login
  "docs.google.com", "drive.google.com", "classroom.google.com", "accounts.google.com", "github.com", "gitlab.com",
  "overleaf.com", "instructure.com", "blackboard.com", "gradescope.com", "piazza.com", "notion.so", "atlassian.net",
  "figma.com", "zoom.us", "sharepoint.com", "onedrive.live.com", "dropbox.com",
];
// Host prefixes that mean a login, account, mail or portal subdomain on any site.
const PREFIXES = [
  "mail.", "webmail.", "login.", "signin.", "auth.", "sso.", "account.", "accounts.", "secure.", "banking.", "canvas.",
  "portal.", "my.", "id.", "mychart.",
];
// Words in the HOSTNAME that mean money or medical records. Same as the extension: no bare "health" (it would block
// ordinary reading like a university health-news site); "hospital"/"clinic" are left out for the same reason.
const HOST_WORDS = ["bank", "credit-union", "creditunion", "insurance", "healthcare", "medicaid", "medicare", "patient", "mychart"];

/** Accepts a hostname ("mail.google.com") or an origin/URL ("https://mail.google.com"). */
export function hostOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

export function isNeverListed(value: string): boolean {
  const host = hostOf(value);
  const bare = host.replace(/^www\./, "");
  if (DOMAINS.some((d) => bare === d || bare.endsWith(`.${d}`))) return true;
  if (PREFIXES.some((p) => host.startsWith(p))) return true;
  return HOST_WORDS.some((w) => bare.includes(w));
}
