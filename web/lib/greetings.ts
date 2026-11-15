// Time-of-day greetings (D-015), shared by the home page and the tutor's opening line so they never disagree.
// Pure: no clock reads here. Callers pass the learner's local time (browser) or the server's (tutor, on localhost).

export type PartOfDay = "late_night" | "early" | "morning" | "afternoon" | "evening" | "night";

export const PARTS: Record<PartOfDay, { from: number; label: string; greeting: string; tutorHint: string }> = {
  late_night: { from: 0, label: "late night", greeting: "¡Hola, night owl! 🌙", tutorHint: "call them a night owl and admire that they're studying this late" },
  early: { from: 5, label: "early morning", greeting: "Early bird! Buenos días ☀️", tutorHint: "call them an early bird" },
  morning: { from: 9, label: "morning", greeting: "¡Buenos días!", tutorHint: "say buenos días warmly" },
  afternoon: { from: 12, label: "afternoon", greeting: "¡Buenas tardes! Study break?", tutorHint: "say buenas tardes and treat it as a study break" },
  evening: { from: 17, label: "evening", greeting: "¡Buenas tardes! Winding down?", tutorHint: "say buenas tardes and ask how their day went" },
  night: { from: 21, label: "night", greeting: "¡Buenas noches!", tutorHint: "say buenas noches warmly" },
};

const ORDER: PartOfDay[] = ["late_night", "early", "morning", "afternoon", "evening", "night"];

export function partOfDay(hour: number): PartOfDay {
  let part: PartOfDay = "late_night";
  for (const p of ORDER) if (hour >= PARTS[p].from) part = p;
  return part;
}

const isWeekend = (day: number) => day === 0 || day === 6;

/** Home page line, e.g. "¡Hola, night owl! 🌙 · Weekend Spanish? Love it. · day 3 in a row". */
export function homeGreeting(opts: { hour: number; day: number; streakDays?: number }): string {
  const parts = [PARTS[partOfDay(opts.hour)].greeting];
  if (isWeekend(opts.day)) parts.push("Weekend Spanish? Love it.");
  if (opts.streakDays && opts.streakDays > 1) parts.push(`day ${opts.streakDays} in a row`);
  return parts.join(" · ");
}

/**
 * One line for the tutor's session info, e.g. "late night, Sunday; it's the weekend (greeting idea: …)".
 * No minutes on purpose: the tutor's instructions are re-sent every turn, and a line that changes each minute would
 * make every reply slower (it breaks the prompt cache). This only changes when the part of the day does.
 */
export function tutorTimeLine(date: Date): string {
  const part = PARTS[partOfDay(date.getHours())];
  const day = date.toLocaleDateString("en-US", { weekday: "long" });
  const weekend = isWeekend(date.getDay()) ? "; it's the weekend" : "";
  return `${part.label}, ${day}${weekend} (greeting idea: ${part.tutorHint})`;
}
