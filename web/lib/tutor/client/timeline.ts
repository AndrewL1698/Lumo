/** Per-turn latency marks (voice-plan §1.8). Runs in the browser and under Node. */
import type { SttPath, TurnTimeline } from "@parrot/shared";
import type { TimelineMark, TimelineRecorder } from "../types";

export function createTimeline(
  sessionId: string,
  utteranceId: string,
  now: () => number = () => performance.now(),
): TimelineRecorder {
  const marks: Partial<Record<TimelineMark, number>> = {};
  let sttPath: SttPath = "realtime";

  return {
    mark(name) {
      if (marks[name] === undefined) marks[name] = now();
    },
    setSttPath(path) {
      sttPath = path;
    },
    toTimeline(): TurnTimeline | null {
      const { tPress, tRelease, tSttFinal } = marks;
      if (tPress === undefined || tRelease === undefined || tSttFinal === undefined) return null;
      return {
        sessionId,
        utteranceId,
        sttPath,
        tPress,
        tRelease,
        tSttFinal,
        tCorrectionShown: marks.tCorrectionShown ?? null,
        tReplyFirstToken: marks.tReplyFirstToken ?? null,
        tFirstChunk: marks.tFirstChunk ?? null,
        tTtsFirstBytes: marks.tTtsFirstBytes ?? null,
        tAudioStart: marks.tAudioStart ?? null,
      };
    },
  };
}
