import Link from "next/link";
import { RecordPanel } from "./RecordPanel";
import { TutorLab } from "./TutorLab";

type Search = Record<string, string | string[] | undefined>;

function href(flags: { debug: boolean; forceBatch: boolean; record: boolean }) {
  const q = [flags.debug && "debug=1", flags.forceBatch && "forceBatch=1", flags.record && "record=1"].filter(Boolean).join("&");
  return q ? `/tutor-lab?${q}` : "/tutor-lab";
}

// Dev page: /tutor-lab, ?debug=1 (timings), ?forceBatch=1 (skip realtime STT), ?record=1 (Pass B recorder only).
export default async function TutorLabPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const flags = { debug: sp.debug === "1", forceBatch: sp.forceBatch === "1", record: sp.record === "1" };
  const link = "underline";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tutor lab</h1>
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link className={link} href={href({ ...flags, debug: !flags.debug })}>
          debug: {flags.debug ? "on" : "off"}
        </Link>
        <Link className={link} href={href({ ...flags, forceBatch: !flags.forceBatch })}>
          forceBatch: {flags.forceBatch ? "on" : "off"}
        </Link>
        <Link className={link} href={href({ ...flags, record: !flags.record })}>
          {flags.record ? "back to the tutor" : "Pass B recorder"}
        </Link>
      </nav>
      {flags.record ? <RecordPanel /> : <TutorLab key={String(flags.forceBatch)} debug={flags.debug} forceBatch={flags.forceBatch} />}
    </div>
  );
}
