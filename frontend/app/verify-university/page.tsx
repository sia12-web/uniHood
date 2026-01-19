"use client";

import BrandLogo from "@/components/BrandLogo";
import { getDemoUserId } from "@/lib/env";
import UniversityVerificationForm from "@/components/UniversityVerificationForm";
import { Target, Users, Gamepad2 } from "lucide-react";

export default function UniversityVerificationPage() {
    const userId = getDemoUserId();

    return (
        <main className="min-h-screen w-full bg-[#f8f9fa] flex items-stretch">
            {/* Left visual side - Pure white to match logo background */}
            <section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-white relative overflow-hidden text-center">
                {/* Subtle accent at edges only */}
                <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-to-tr from-indigo-50/50 to-transparent" />
                <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-gradient-to-bl from-slate-50/50 to-transparent" />

                <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                    <div className="mb-8">
                        <BrandLogo
                            asLink={false}
                            backgroundTone="light"
                            logoWidth={400}
                            logoHeight={400}
                            disableMixBlend={true}
                            logoClassName="!h-[280px] w-auto"
                        />
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
                            <span className="text-indigo-600">Verify.</span> <span className="text-slate-700">Connect.</span> <span className="text-slate-900">Thrive.</span>
                        </h2>
                        <p className="text-lg text-slate-600 leading-relaxed font-medium">
                            Join your verified campus community to unlock exclusive features and connect with real students.
                        </p>
                    </div>

                    <div className="mt-16 grid grid-cols-3 gap-6 w-full px-4">
                        <div className="flex flex-col items-center gap-3 group">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-indigo-600 shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                                <Target className="h-6 w-6" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Discover</span>
                        </div>
                        <div className="flex flex-col items-center gap-3 group">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-emerald-600 shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                                <Users className="h-6 w-6" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Connect</span>
                        </div>
                        <div className="flex flex-col items-center gap-3 group">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                                <Gamepad2 className="h-6 w-6" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Compete</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Right form side */}
            <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-white shadow-2xl z-20">
                <div className="w-full max-w-[420px] space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="lg:hidden flex justify-center mb-6">
                        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                            <BrandLogo
                                asLink={false}
                                backgroundTone="light"
                                logoWidth={450}
                                logoHeight={450}
                                disableMixBlend={true}
                                logoClassName="!h-48 !w-auto object-contain"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-slate-900">University Verification</h3>
                            <p className="text-sm text-slate-500">
                                Verify your student status using your university email.
                            </p>
                        </div>
                        <UniversityVerificationForm userId={userId} />
                    </div>
                </div>
            </section>
        </main>
    );
}
