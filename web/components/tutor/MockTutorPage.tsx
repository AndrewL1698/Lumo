"use client";
import { useMockTutorSession } from "../../lib/tutor/useMockTutorSession";
import { TutorPage } from "./TutorPage";

// Drop-in for app/tutor/page.tsx until Andrew's useTutorSession is wired (plan step 9).
export function MockTutorPage() {
  return <TutorPage session={useMockTutorSession()} />;
}
