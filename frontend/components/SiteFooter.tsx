import Link from "next/link";

export default function SiteFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="border-t border-warm-sand/50 dark:border-slate-800 bg-warm-sand/30 dark:bg-slate-900/50 backdrop-blur-sm mt-auto">
            <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8">

                    {/* Brand Section */}
                    <div className="flex flex-col items-center md:items-start space-y-2">
                        <span className="text-xl font-bold tracking-tight text-navy dark:text-slate-200">
                            Campus
                        </span>
                        <p className="text-sm text-center md:text-left text-navy/70 dark:text-slate-400 max-w-xs">
                            Discover your university world. Connect, play, and share moments in real-time.
                        </p>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex items-center gap-6 sm:gap-8 text-sm font-medium text-navy/80 dark:text-slate-300">
                        <Link
                            href="/privacy"
                            className="hover:text-coral dark:hover:text-coral transition-colors duration-200"
                        >
                            Privacy
                        </Link>
                        <Link
                            href="/terms"
                            className="hover:text-coral dark:hover:text-coral transition-colors duration-200"
                        >
                            Terms
                        </Link>
                        <Link
                            href="/support"
                            className="hover:text-coral dark:hover:text-coral transition-colors duration-200"
                        >
                            Support
                        </Link>
                    </nav>

                    {/* Copyright */}
                    <div className="text-xs text-navy/50 dark:text-slate-500">
                        &copy; {currentYear} Campus Inc.
                    </div>
                </div>
            </div>
        </footer>
    );
}
