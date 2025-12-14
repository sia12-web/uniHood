import Link from "next/link";
import { Instagram, Twitter, Linkedin, ArrowRight, Heart } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function SiteFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="relative border-t border-warm-sand/50 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl mt-auto z-40">
            {/* Decorative top gradient */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-coral/50 to-transparent opacity-50" />

            <div className="mx-auto max-w-7xl px-6 py-12 md:py-16 lg:px-8">
                <div className="xl:grid xl:grid-cols-3 xl:gap-8">
                    {/* Brand Section */}
                    <div className="space-y-4 xl:col-span-1">
                        <div className="origin-left scale-90 sm:scale-100">
                            <BrandLogo withWordmark={true} tagline="" disableMixBlend={true} />
                        </div>
                        <div className="flex gap-4">
                            <SocialLink href="https://instagram.com/unihood.app" icon={Instagram} label="Instagram" />
                            <SocialLink href="#" icon={Twitter} label="Twitter" />
                            <SocialLink href="#" icon={Linkedin} label="LinkedIn" />
                        </div>
                    </div>

                    {/* Links Grid */}
                    <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
                        <div className="md:grid md:grid-cols-2 md:gap-8">
                            <div>
                                <h3 className="text-sm font-semibold leading-6 text-navy dark:text-slate-200">Discover</h3>
                                <ul role="list" className="mt-6 space-y-4">
                                    <FooterLink href="/feed">Community Feed</FooterLink>
                                    <FooterLink href="/map">Interactive Map</FooterLink>
                                    <FooterLink href="/activities">Events & Activities</FooterLink>
                                    <FooterLink href="/market">Student Market</FooterLink>
                                </ul>
                            </div>
                            <div className="mt-10 md:mt-0">
                                <h3 className="text-sm font-semibold leading-6 text-navy dark:text-slate-200">Support</h3>
                                <ul role="list" className="mt-6 space-y-4">
                                    <FooterLink href="/help">Help Center</FooterLink>
                                    <FooterLink href="/safety">Safety Guides</FooterLink>
                                    <FooterLink href="/contact">Contact Support</FooterLink>
                                    <FooterLink href="/status">System Status</FooterLink>
                                </ul>
                            </div>
                        </div>
                        <div className="md:grid md:grid-cols-2 md:gap-8">
                            <div>
                                <h3 className="text-sm font-semibold leading-6 text-navy dark:text-slate-200">Legal</h3>
                                <ul role="list" className="mt-6 space-y-4">
                                    <FooterLink href="/privacy">Privacy Policy</FooterLink>
                                    <FooterLink href="/terms">Terms of Service</FooterLink>
                                    <FooterLink href="/cookies">Cookie Policy</FooterLink>
                                </ul>
                            </div>
                            <div className="mt-10 md:mt-0">
                                <h3 className="text-sm font-semibold leading-6 text-navy dark:text-slate-200">Stay Updated</h3>
                                <p className="mt-4 text-sm text-navy/60 dark:text-slate-500">
                                    Subscribe to our newsletter for the latest campus updates.
                                </p>
                                <form className="mt-4 relative max-w-md">
                                    <label htmlFor="email-address" className="sr-only">Email address</label>
                                    <input
                                        type="email"
                                        name="email-address"
                                        id="email-address"
                                        autoComplete="email"
                                        required
                                        className="block w-full rounded-full border-0 bg-white/50 dark:bg-slate-900/50 py-2.5 pl-4 pr-12 text-navy dark:text-slate-200 ring-1 ring-inset ring-navy/10 dark:ring-slate-700 placeholder:text-navy/40 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-coral sm:text-sm sm:leading-6 transition-all shadow-sm"
                                        placeholder="Enter your email"
                                    />
                                    <button
                                        type="button"
                                        className="absolute inset-y-1 right-1 flex items-center justify-center w-8 h-8 rounded-full bg-coral/10 text-coral hover:bg-coral hover:text-white transition-colors focus:outline-none"
                                        aria-label="Subscribe"
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-16 border-t border-navy/10 dark:border-slate-800 pt-8 sm:mt-20 lg:mt-24 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-xs leading-5 text-navy/60 dark:text-slate-500">
                        &copy; {currentYear} uniHood Inc. All rights reserved.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-navy/60 dark:text-slate-500">
                        <span>Built with</span>
                        <Heart className="h-3 w-3 text-red-500 fill-current animate-pulse" />
                        <span>for students</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function SocialLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
    return (
        <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center p-2.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-navy/5 dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:text-coral dark:hover:text-coral hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            aria-label={label}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
        </Link>
    );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <li>
            <Link href={href} className="text-sm leading-6 text-navy/70 hover:text-coral hover:pl-1 dark:text-slate-400 dark:hover:text-coral transition-all duration-200 block">
                {children}
            </Link>
        </li>
    );
}
