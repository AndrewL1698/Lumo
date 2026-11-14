import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Bare root layout. Shravan owns layout, nav, design tokens and all pages.
export const metadata: Metadata = { title: "Parrot" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
