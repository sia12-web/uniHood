export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-12 sm:px-8 sm:py-16">
                <div className="w-full max-w-3xl">
                    {children}
                </div>
            </div>
        </main>
    );
}
