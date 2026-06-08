import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "National Pokédex Tracker",
  description: "Personal binder progress: one card per Pokémon, #1–1025",
};

// `viewport-fit=cover` lets the layout extend under the notch / home indicator;
// the shell pads its fixed chrome (top bar, drawer, FAB, sticky footers) with
// env(safe-area-inset-*) so nothing is occluded. On non-notched devices every
// inset resolves to 0px, so desktop is unaffected. maximumScale is intentionally
// left unset so users can still pinch-zoom (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Inline script: read the saved theme preference and toggle the `.dark` class
// before React hydrates. Prevents a light-to-dark flash for dark-mode users
// on full page reload.
const themeInitScript = `
(function(){
  try {
    var raw = localStorage.getItem('pokedex-theme');
    var theme = raw === 'light' || raw === 'dark' ? raw : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geist.variable, jetbrainsMono.variable, "font-sans")}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
