import { OnboardingStepIndicator } from "./_components/OnboardingStepIndicator";
import Image from "next/image";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-x-hidden selection:bg-indigo-500/30">
            {/* Background Image with Overlay */}
            <div className="fixed inset-0 z-0 h-full w-full">
                <Image
                    src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=2070&auto=format&fit=crop"
                    alt="University Campus Background"
                    fill
                    className="object-cover"
                    priority
                    quality={90}
                />
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-slate-900/30" />
            </div>

            {/* Content Container */}
            <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 sm:px-6 sm:py-12 flex flex-col items-center">

                {/* Global Progress Indicator */}
                <OnboardingStepIndicator />

                {/* Card */}
                <div className="w-full max-w-3xl bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl border border-white/20 overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-500 slide-in-from-bottom-4">
                    {children}
                </div>

                {/* Footer / Branding or Trust Indicators could go here */}
                <p className="mt-6 text-sm text-white/50 font-medium">
                    uniHood &copy; {new Date().getFullYear()}
                </p>
            </div>
        </main>
    );
}
