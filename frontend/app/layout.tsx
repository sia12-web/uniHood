import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";

import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Divan",
  description: "Phase 1 proximity core UI",
  icons: {
    icon: [
      { url: "/brand/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/favicon.png", sizes: "96x96", type: "image/png" },
      { url: "/brand/favicon.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/favicon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/brand/favicon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function() {
              try {
                var stored = localStorage.getItem('divan.website.settings');
                var theme = stored ? JSON.parse(stored).theme : 'system';
                // Map old 'light' to 'system' for backwards compatibility
                if (theme === 'light') theme = 'system';
                var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            })();
          `}
        </Script>
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
