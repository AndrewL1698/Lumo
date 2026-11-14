"use client";
import { TutorPage } from "@/components/tutor/TutorPage";
import { useMockTutorSession } from "./mockTutorSession";
// TODO(demo): swap to Andrew's hook (web/lib/tutor/client/useTutorSession) once it lands (plan step 9):
// import { useTutorSession } from "@/lib/tutor/client/useTutorSession";

export default function Page() {
  return <TutorPage session={useMockTutorSession()} />;
}
