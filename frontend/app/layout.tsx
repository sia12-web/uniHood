import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";

import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Divan",
  description: "Phase 1 proximity core UI",

};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="boot-flags" strategy="beforeInteractive">
          {`
            (function() {
              var defaults = {
                "ui.moderation.enabled": false,
                "ui.safety.enabled": false,
                "ui.media.v2.enabled": false,
                "ui.metrics.ux.enabled": true,
                "ui.blur.sensitive.enabled": true
              };
              var current = (typeof window !== "undefined" && window.__BOOT_FLAGS__) || {};
              if (typeof window !== "undefined") {
                window.__BOOT_FLAGS__ = Object.assign({}, defaults, current);
              }
            })();
          `}
        </Script>
      </head>
      <body className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50 antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
