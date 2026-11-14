"use client";
import { TutorPage } from "@/components/tutor/TutorPage";
import { useTutorSession } from "@/lib/tutor/client/useTutorSession";

export default function Page() {
  return <TutorPage session={useTutorSession()} />;
}
