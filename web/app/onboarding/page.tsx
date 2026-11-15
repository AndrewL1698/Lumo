import { redirect } from "next/navigation";

// Setup now lives at the top of Settings ("Get set up"). Old links land there.
export default function Page() {
  redirect("/settings#setup");
}
