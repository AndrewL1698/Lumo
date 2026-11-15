import { Settings } from "@parrot/shared";

// Save only the fields this page edits. PUT replaces the whole object, so we GET the latest settings first
// and merge our fields onto them; that way we never overwrite the allowlist the extension may have changed.
export async function saveSettings(patch: Partial<Settings>): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const getRes = await fetch("/api/settings", { cache: "no-store" });
    if (!getRes.ok) throw new Error(`HTTP ${getRes.status}`);
    const fresh = Settings.parse(await getRes.json());
    const merged = Settings.parse({ ...fresh, ...patch }); // validated before sending
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(merged),
    });
    if (res.status === 400) {
      return { ok: false, message: "Those settings were rejected. Lumo never runs on email, chat, banking and similar sites." };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "We couldn't save your settings. Please try again." };
  }
}
