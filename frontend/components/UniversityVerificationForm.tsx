"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { confirmUniversityVerificationCode, sendUniversityVerificationCode, reissueAccessToken } from "@/lib/identity";

type Step = "email" | "code" | "success";

interface UniversityVerificationFormProps {
    userId: string;
    campusId: string;
}

export default function UniversityVerificationForm({ userId, campusId }: UniversityVerificationFormProps) {
    const { push: toast } = useToast();
    const [step, setStep] = useState<Step>("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes("@")) {
            toast({ title: "Invalid Email", description: "Please enter a valid university email address.", variant: "error" });
            return;
        }

        setIsLoading(true);
        try {
            await sendUniversityVerificationCode(email, userId, campusId);
            setStep("code");
            toast({ title: "Code Sent", description: "Check your inbox for the verification code." });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to send verification code.";
            toast({ title: "Error", description: msg, variant: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) {
            toast({ title: "Invalid Code", description: "Code must be 6 digits.", variant: "error" });
            return;
        }

        setIsLoading(true);
        try {
            await confirmUniversityVerificationCode(code, userId, campusId);
            // Refresh token to get updated isUniversityVerified claim
            try {
                await reissueAccessToken();
            } catch (refreshErr) {
                // Token refresh failed, user may need to re-login
                console.warn("Failed to refresh token after verification:", refreshErr);
            }
            setStep("success");
            toast({ title: "Verified!", description: "You have successfully verified your university status.", variant: "success" });
        } catch {
            toast({ title: "Verification Failed", description: "Invalid or expired code.", variant: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8">
                    <AnimatePresence mode="wait">
                        {step === "email" && (
                            <motion.form
                                key="email-step"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleSendCode}
                                className="space-y-6"
                            >
                                <div className="text-center space-y-2">
                                    <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                        <Mail className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">University Email</h3>
                                    <p className="text-sm text-slate-500">
                                        Enter your university email address (e.g. .edu or .ca) to verify your student status.
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="email" className="sr-only">University Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="student@university.edu"
                                        className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                                        autoFocus
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Send Code <ChevronRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </motion.form>
                        )}

                        {step === "code" && (
                            <motion.form
                                key="code-step"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleConfirmCode}
                                className="space-y-6"
                            >
                                <div className="text-center space-y-2">
                                    <div className="bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600">
                                        <ShieldCheck className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">Check Your Inbox</h3>
                                    <p className="text-sm text-slate-500">
                                        We sent a 6-digit code to <span className="font-semibold text-slate-900">{email}</span>
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="code" className="sr-only">Verification Code</label>
                                    <input
                                        id="code"
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="000000"
                                        className="w-full h-14 text-center text-3xl tracking-[0.5em] font-mono rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                        autoFocus
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || code.length !== 6}
                                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        "Verify Code"
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setStep("email")}
                                    className="w-full text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                                >
                                    Change Email or Resend
                                </button>
                            </motion.form>
                        )}

                        {step === "success" && (
                            <motion.div
                                key="success-step"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center space-y-6 py-8"
                            >
                                <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-green-600 ring-8 ring-green-50">
                                    <Check className="w-10 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-slate-900">Verification Complete!</h3>
                                    <p className="text-slate-500">
                                        Thank you for verifying your student status. You now have access to university-exclusive features.
                                    </p>
                                </div>
                                <button
                                    onClick={() => window.location.href = "/"}
                                    className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-all shadow-lg"
                                >
                                    Continue to Home
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
