import { redirect } from "next/navigation";

// "What Lumo knows" now lives under the jar (D-024). Old links and bookmarks land on its section.
export default function Page() {
  redirect("/vocabulary#keeps");
}
