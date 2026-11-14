import type { Metadata } from "next";
import { B612, B612_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import "./globals.css";

const b612 = B612({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-b612", display: "swap" });
const b612Mono = B612_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-b612-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Parrot",
  description: "Your morning reading becomes tonight's conversation lesson.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${b612.variable} ${b612Mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
