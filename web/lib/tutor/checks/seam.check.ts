/**
 * Type-only seam check: compiled by `npx tsc --noEmit -p web`, never run.
 * Fails to compile if the real hook stops dropping into Shravan's page (web/app/tutor/session.ts).
 */
import type { TutorSession, TutorTurn } from "../../../app/tutor/session";
import type { useTutorSession } from "../client/useTutorSession";
import type { Turn, UseTutorSession } from "../types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** The hook's value is usable wherever his page expects a TutorSession. */
export const hookFitsPage: TutorSession = null as unknown as UseTutorSession;
export const turnFitsPage: TutorTurn = null as unknown as Turn;

/** The hook returns exactly UseTutorSession, and takes the documented options. */
export const returnsSeamType: Equal<ReturnType<typeof useTutorSession>, UseTutorSession> = true;
export const takesOptions: Equal<
  Parameters<typeof useTutorSession>,
  [opts?: { forceBatch?: boolean; placement?: boolean }]
> = true;
