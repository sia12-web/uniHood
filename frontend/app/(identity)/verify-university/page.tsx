"use client";

import { useState, useEffect } from "react";
import { Target, Users, Gamepad2, School, ChevronRight, Loader2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { getDemoUserId } from "@/lib/env";
import UniversityVerificationForm from "@/components/UniversityVerificationForm";
import { campusesApi, Campus } from "@/lib/campuses";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

export default function UniversityVerificationPage() {
    const userId = getDemoUserId();
    const [step, setStep] = useState<"select" | "verify">("select");
    const [campuses, setCampuses] = useState<Campus[]>([]);
    const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
    const [loading, setLoading] = useState(true);
    const { push: toast } = useToast();

    useEffect(() => {
        async function loadCampuses() {
            try {
                const data = await campusesApi.listCampuses();
                setCampuses(data);
            } catch (err) {
                console.error("Failed to load campuses", err);
                toast({ title: "Error", description: "Failed to load universities.", variant: "error" });
            } finally {
                setLoading(false);
            }
        }
        loadCampuses();
    }, [toast]);

    const handleSelect = (campus: Campus) => {
        setSelectedCampus(campus);
        setStep("verify");
    };

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

                    <AnimatePresence mode="wait">
                        {step === "select" ? (
                            <motion.div
                                key="select"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="text-center space-y-2">
                                    <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                        <School className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">Select Your University</h3>
                                    <p className="text-sm text-slate-500">
                                        Choose your campus to proceed with verification.
                                    </p>
                                </div>

                                {loading ? (
                                    <div className="flex justify-center p-8">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                    </div>
                                ) : (
                                    <div className="grid gap-3 max-h-[400px] overflow-y-auto p-1">
                                        {campuses.map((campus) => (
                                            <button
                                                key={campus.id}
                                                onClick={() => handleSelect(campus)}
                                                className="flex items-center justify-between w-full p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500/20 transition-all group text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {campus.logo_url ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={campus.logo_url} alt={campus.name} className="w-10 h-10 object-contain rounded-md" />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-slate-100 rounded-md flex items-center justify-center text-slate-400">
                                                            <School size={20} />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                                            {campus.name}
                                                        </p>
                                                        {campus.domain && (
                                                            <p className="text-xs text-slate-500">
                                                                {campus.domain}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                            </button>
                                        ))}
                                        {campuses.length === 0 && (
                                            <p className="text-center text-slate-500 py-4">No campuses found.</p>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="verify"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >
                                <button
                                    onClick={() => setStep("select")}
                                    className="mb-6 text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1"
                                >
                                    &larr; Back to Selection
                                </button>
                                <div className="mb-6 text-center">
                                    <h3 className="text-lg font-bold text-slate-900">{selectedCampus?.name}</h3>
                                </div>
                                <UniversityVerificationForm userId={userId} campusId={selectedCampus?.id || ""} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </section>
        </main>
    );
}
