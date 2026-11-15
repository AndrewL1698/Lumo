/** In-memory tutor session store (voice-plan §3). Lives on globalThis so Next dev hot reload keeps it. */
import { tutorContextFixture } from "@parrot/shared";
import type { CorrectionError, TargetWordUse, TutorContext } from "@parrot/shared";
import { errorKey } from "./policy";
import type { SessionState } from "./types";

const g = globalThis as typeof globalThis & { __parrotTutorSessions?: Map<string, SessionState> };
const sessions = (g.__parrotTutorSessions ??= new Map<string, SessionState>());

export function getSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    // TODO(demo): real context comes from /api/tutor/context in task 10
    const context: TutorContext = { ...tutorContextFixture, sessionId };
    s = {
      sessionId,
      context,
      policy: {
        turnIndex: 0,
        lastSpokenCorrectionTurn: null,
        errorCounts: {},
        errorExamples: {},
        lastErrors: [],
        targetLemmas: context.targetWords.map((w) => w.lemma),
        usedLemmas: [],
      },
      creditedLemmas: [],
      fromContext: false,
      allErrors: [],
    };
    sessions.set(sessionId, s);
  }
  return s;
}

/** The session if it exists; never creates one. */
export function findSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

/** Replace the session's context (and its target lemmas); policy counters are kept. */
export function setSessionContext(sessionId: string, context: TutorContext): void {
  const s = getSession(sessionId);
  s.context = context;
  s.fromContext = true;
  s.policy.targetLemmas = context.targetWords.map((w) => w.lemma);
}

/** Record one learner turn's validated correction. Call exactly once per utterance (it advances turnIndex). */
export function recordCorrection(sessionId: string, kept: CorrectionError[], used: TargetWordUse[]): void {
  const s = getSession(sessionId);
  const p = s.policy;
  for (const e of kept) {
    const key = errorKey(e);
    p.errorCounts[key] = (p.errorCounts[key] ?? 0) + 1;
    p.errorExamples[key] = { span: e.span, correction: e.correction, reason: e.explanation_en };
  }
  p.lastErrors = kept;
  s.allErrors.push(...kept);
  for (const u of used) {
    if (!u.correct) continue;
    const target = p.targetLemmas.find((l) => l.toLowerCase() === u.lemma.toLowerCase());
    if (target && !p.usedLemmas.includes(target)) p.usedLemmas.push(target);
  }
  p.turnIndex += 1;
  // TODO(demo): write utterances row (Karthik's db)
}

/** The tutor just spoke an explicit correction: start the 3-turn cooldown from the current turn. */
export function noteSpokenCorrection(sessionId: string): void {
  const p = getSession(sessionId).policy;
  p.lastSpokenCorrectionTurn = p.turnIndex;
}

/** For checks only. */
export function resetSessions(): void {
  sessions.clear();
}
