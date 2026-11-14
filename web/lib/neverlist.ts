// Hard never-list (root CLAUDE.md rule 4): email, chat, banking, health, Docs/Canvas/GitHub, login and form pages.
// Enforced server-side even if the user allowlists them. The extension enforces its own copy client-side.

// A host matches if it equals one of these or is a subdomain of it.
const DOMAINS = [
  // email
  "mail.google.com", "inbox.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com",
  "mail.yahoo.com", "proton.me", "protonmail.com", "icloud.com", "fastmail.com",
  // chat
  "slack.com", "discord.com", "web.whatsapp.com", "whatsapp.com", "messenger.com", "web.telegram.org",
  "teams.microsoft.com", "chat.google.com", "groupme.com",
  // docs, school, code
  "docs.google.com", "drive.google.com", "classroom.google.com", "instructure.com", "github.com",
  "gitlab.com", "notion.so", "office.com", "sharepoint.com", "onedrive.live.com", "dropbox.com",
  // banking and payments
  "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "usbank.com", "pnc.com",
  "schwab.com", "fidelity.com", "vanguard.com", "paypal.com", "venmo.com", "americanexpress.com", "discover.com",
  // health
  "mychart.com", "mychart.org", "healthcare.gov", "zocdoc.com", "patient.info", "cvs.com", "walgreens.com",
];
// Host prefixes that mean a login, account, mail or health portal on any site.
const PREFIXES = ["login.", "signin.", "accounts.", "account.", "auth.", "sso.", "id.", "mail.", "webmail.", "mychart.", "portal."];
// Substrings that mean banking/health on any domain.
const KEYWORDS = ["bank", "mychart", "patient", "health"];

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
  if (DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  if (PREFIXES.some((p) => host.startsWith(p))) return true;
  return KEYWORDS.some((k) => host.includes(k));
}
