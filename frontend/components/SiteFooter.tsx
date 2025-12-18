"use client";

import Link from "next/link";
import { Instagram } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function SiteFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="w-full border-t border-warm-sand/50 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl mt-auto z-40">
            <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
                <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
                    {/* Logo */}
                    <div className="flex-shrink-0 rounded-xl bg-warm-sand/30 dark:bg-slate-800/50 p-3">
                        <BrandLogo
                            withWordmark={false}
                            tagline=""
                            disableMixBlend={true}
                            asLink={false}
                            logoClassName="h-20 w-auto sm:h-24"
                        />
                    </div>

                    {/* Navigation */}
                    <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                        <FooterLink href="/contact">Support</FooterLink>
                        <FooterLink href="/legal">Legal</FooterLink>
                        <FooterLink href="/privacy">Privacy</FooterLink>
                        <FooterLink href="/terms">Terms</FooterLink>
                    </nav>

                    {/* Socials & Copyright */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="https://instagram.com/unihood.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-navy/60 hover:text-coral dark:text-slate-400 dark:hover:text-coral transition-colors"
                            aria-label="Instagram"
                        >
                            <Instagram className="h-5 w-5" />
                        </Link>
                        <span className="text-xs text-navy/40 dark:text-slate-600 border-l border-navy/10 dark:border-slate-800 pl-4">
                            &copy; {currentYear}
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="text-sm font-medium text-navy/70 hover:text-coral dark:text-slate-400 dark:hover:text-coral transition-colors">
            {children}
        </Link>
    );
}
