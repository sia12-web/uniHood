import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import dynamic from "next/dynamic";

import AppChrome from "@/components/AppChrome";

const PerformanceMonitor = dynamic(() => import("@/components/PerformanceMonitor"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: {
    default: "uniHood",
    template: "%s | uniHood",
  },
  description: "Connect with students nearby on uniHood.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/android-chrome-192x192.png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
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
        <PerformanceMonitor />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
