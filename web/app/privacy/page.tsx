import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <>
      <PageHeader title="What Parrot knows" subtitle="Everything Parrot has stored about you, with a delete button for each item." />
      <EmptyState>Coming soon.</EmptyState>
    </>
  );
}
