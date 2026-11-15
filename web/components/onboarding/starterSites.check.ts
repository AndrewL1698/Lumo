/** Run from web/: npx tsx components/onboarding/starterSites.check.ts */
import assert from "node:assert/strict";
import { READING_SITE_GROUPS, READING_SITES } from "@parrot/shared";
import { isNeverListed } from "@/lib/neverlist";
import { starterAllowlist } from "./StarterSites";

// The list (D-021): exact https origins, no duplicates, never-list clean, 10–20 starters in every group.
const origins = READING_SITES.map((s) => s.origin);
assert.equal(new Set(origins).size, origins.length, "duplicate origin");
for (const s of READING_SITES) {
  const u = new URL(s.origin);
  assert.equal(u.protocol, "https:", s.origin);
  assert.equal(u.origin, s.origin, `${s.origin} is not a bare origin`);
  assert.ok(!isNeverListed(s.origin), `${s.origin} is on the never-list`);
  assert.ok(READING_SITE_GROUPS.includes(s.group), s.origin);
}
const starters = READING_SITES.filter((s) => s.starter);
assert.ok(starters.length >= 10 && starters.length <= 20, `starter count ${starters.length}`);
assert.equal(starters[0].origin, "https://www.npr.org", "the demo site comes first");
for (const g of READING_SITE_GROUPS)
  assert.ok(
    starters.some((s) => s.group === g),
    `no starter in ${g}`,
  );

// Saving: checked starters, plus non-starter entries already on the allowlist; unchecked starters drop out.
const npr = "https://www.npr.org";
const bbc = "https://www.bbc.com";
const mine = "https://example.org";
assert.deepEqual(starterAllowlist(new Set([npr]), [bbc, mine]), [npr, mine]);
assert.deepEqual(starterAllowlist(new Set(), [npr, mine]), [mine]);
assert.deepEqual(
  starterAllowlist(new Set(origins), []).length,
  starters.length,
  "non-starters are never added",
);

console.log(`starterSites ok: ${starters.length} starters, ${READING_SITES.length} sites in all`);
