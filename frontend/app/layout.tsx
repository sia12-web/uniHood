import "./globals.css";
import type { Metadata } from "next";

import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Divan Proximity",
  description: "Phase 1 proximity core UI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
