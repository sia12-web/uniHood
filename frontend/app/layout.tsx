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
  description: "Connect with students nearby.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }],
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
                var stored = localStorage.getItem('unihood.website.settings');
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
