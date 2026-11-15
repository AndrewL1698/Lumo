import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { FireflyCursor } from "@/components/FireflyCursor";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Grass, NightSky } from "@/components/NightSky";
import { SkyFireflies } from "@/components/SkyFireflies";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-atkinson", display: "swap" });
const bricolage = Bricolage_Grotesque({ weight: ["600", "800"], subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Lumo",
  description: "Read it. Say it. Light it up. Your morning reading becomes tonight's Spanish conversation.",
};

// Runs before the first paint so a saved light theme never flashes dark (components/ThemeToggle.tsx).
const THEME_SCRIPT = `try{if(localStorage.getItem("luci-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning // the theme script may change data-theme before React hydrates
      className={`${atkinson.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="relative flex min-h-screen flex-col">
        <NightSky>
          <SkyFireflies />
        </NightSky>
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <Footer />
        <Grass />
        <FireflyCursor />
      </body>
    </html>
  );
}
