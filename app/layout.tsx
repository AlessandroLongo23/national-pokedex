import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "National Pokédex Tracker",
  description: "Personal binder progress: one card per Pokémon, #1–1025",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
