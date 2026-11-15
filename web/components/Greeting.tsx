"use client";
// Time-of-day greeting on the home page (D-015): the learner's own clock, plus their streak when there is one.
// Testing only: add ?hour=1 (0–23) to the address to preview any part of the day.
import { useEffect, useState } from "react";
import { VocabResponse } from "@parrot/shared";
import { homeGreeting } from "@/lib/greetings";
import { useFetch } from "@/components/useFetch";

export function Greeting({ className = "" }: { className?: string }) {
  // Rendered after mount only: the server's time and the browser's time can differ.
  const [now, setNow] = useState<{ hour: number; day: number } | null>(null);
  const { data } = useFetch("/api/vocab", VocabResponse);

  useEffect(() => {
    const d = new Date();
    const preview = Number(new URLSearchParams(window.location.search).get("hour"));
    const hour = Number.isInteger(preview) && preview >= 0 && preview <= 23 && window.location.search.includes("hour=") ? preview : d.getHours();
    setNow({ hour, day: d.getDay() });
  }, []);

  if (!now) return <p className={className} aria-hidden="true">&nbsp;</p>; // keeps the layout from jumping
  return <p className={className}>{homeGreeting({ ...now, streakDays: data?.streakDays })}</p>;
}
