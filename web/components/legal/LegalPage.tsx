import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="max-w-3xl">
      <PageHeader title={title} subtitle={`Last updated ${updated}`} />
      <div className="space-y-8 text-lg leading-relaxed text-ink [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_ul]:space-y-1 [&_ul]:text-muted">
        {children}
      </div>
    </article>
  );
}
