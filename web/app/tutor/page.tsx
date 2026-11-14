"use client";
import { useEffect, useState } from "react";
import { TutorPage } from "@/components/tutor/TutorPage";
import { useTutorSession } from "@/lib/tutor/client/useTutorSession";
import { useMockTutorSession } from "./mockTutorSession";

function RealTutor() {
  return <TutorPage session={useTutorSession()} />;
}

// Rehearsal mode (/tutor?mock=1): scripted tutor, no mic, no API calls, no credits.
// Backup if the network or an API fails on stage, and for recording the backup video.
function MockTutor() {
  return (
    <>
      <p className="mx-auto mb-6 max-w-5xl rounded-sm border border-wait/70 bg-panel px-4 py-2 text-sm text-ink">
        <span className="mr-2 font-mono text-xs uppercase tracking-wider text-wait">Rehearsal</span>
        A scripted conversation. The mic is off and nothing is saved.
      </p>
      <TutorPage session={useMockTutorSession()} />
    </>
  );
}

export default function Page() {
  const [mode, setMode] = useState<"real" | "mock" | null>(null);
  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("mock") === "1" ? "mock" : "real");
  }, []);
  if (mode === null) return null;
  return mode === "mock" ? <MockTutor /> : <RealTutor />;
}
