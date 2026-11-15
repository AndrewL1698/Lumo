"use client";
import { useEffect, useState } from "react";
import { TutorPage } from "@/components/tutor/TutorPage";
import { useTutorSession } from "@/lib/tutor/client/useTutorSession";
import { useMockTutorSession } from "./mockTutorSession";

// .night-page switches the whole page (nav and footer too) to the night theme (globals.css).
function RealTutor() {
  return (
    <div className="night-page">
      <TutorPage session={useTutorSession()} />
    </div>
  );
}

// Rehearsal mode (/tutor?mock=1): scripted tutor, no mic, no API calls, no credits.
// Backup if the network or an API fails on stage, and for recording the backup video.
function MockTutor() {
  return (
    <div className="night-page">
      <p className="mx-auto mb-3 max-w-5xl text-xs text-muted sm:mb-6 sm:text-sm">
        <strong className="mr-1 text-wait">Rehearsal.</strong>A scripted conversation. The mic is off and nothing is saved.
      </p>
      <TutorPage session={useMockTutorSession()} />
    </div>
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
