"use client";

import { useState, FormEvent } from "react";
import { Send, CheckCircle, AlertCircle, Mail, MessageSquare, User, Tag } from "lucide-react";
import { apiFetch } from "@/app/lib/http/client";
import BackButton from "@/components/BackButton";

const CATEGORIES = [
    { value: "general", label: "General Inquiry" },
    { value: "bug", label: "Bug Report" },
    { value: "feature", label: "Feature Request" },
    { value: "account", label: "Account Issue" },
    { value: "abuse", label: "Report Abuse" },
    { value: "other", label: "Other" },
];

type FormState = "idle" | "submitting" | "success" | "error";

export default function ContactPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [category, setCategory] = useState("general");
    const [formState, setFormState] = useState<FormState>("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setFormState("submitting");
        setErrorMessage("");

        try {
            await apiFetch("/contact", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    email,
                    subject,
                    message,
                    category,
                }),
            });
            setFormState("success");
            // Reset form
            setName("");
            setEmail("");
            setSubject("");
            setMessage("");
            setCategory("general");
        } catch (err) {
            setFormState("error");
            setErrorMessage(err instanceof Error ? err.message : "Failed to submit. Please try again.");
        }
    };

    if (formState === "success") {
        return (
            <main className="min-h-screen bg-gradient-to-br from-cream via-white to-warm-sand/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
                <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
                    <div className="rounded-3xl border border-emerald-200 bg-white/80 dark:bg-slate-800/80 p-8 text-center shadow-xl backdrop-blur-sm">
                        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                            <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h1 className="mb-2 text-2xl font-bold text-navy dark:text-slate-100">Message Sent!</h1>
                        <p className="mb-6 text-navy/70 dark:text-slate-400">
                            Thank you for reaching out. We&apos;ll get back to you as soon as possible.
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <button
                                type="button"
                                onClick={() => setFormState("idle")}
                                className="rounded-full bg-navy px-6 py-3 font-medium text-white transition hover:bg-midnight dark:bg-indigo-600 dark:hover:bg-indigo-500"
                            >
                                Send Another Message
                            </button>
                            <BackButton label="Back" fallbackHref="/" className="justify-center px-6 py-3" />
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-cream via-white to-warm-sand/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
            <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
                {/* Header */}
                <div className="mb-8">
                    <div className="mb-4">
                        <BackButton label="Back" fallbackHref="/" className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm" />
                    </div>
                    <h1 className="text-3xl font-bold text-navy dark:text-slate-100 sm:text-4xl">Contact Us</h1>
                    <p className="mt-2 text-navy/70 dark:text-slate-400">
                        Have a question, found a bug, or want to share feedback? We&apos;d love to hear from you!
                    </p>
                </div>

                {/* Form Card */}
                <div className="rounded-3xl border border-warm-sand/60 bg-white/80 dark:bg-slate-800/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
                    {formState === "error" && (
                        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
                            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
                            <div>
                                <p className="font-medium text-red-800 dark:text-red-300">Failed to send message</p>
                                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Name and Email Row */}
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div>
                                <label htmlFor="name" className="mb-2 flex items-center gap-2 text-sm font-medium text-navy dark:text-slate-200">
                                    <User className="h-4 w-4 text-navy/50 dark:text-slate-500" />
                                    Your Name
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    maxLength={100}
                                    className="w-full rounded-xl border border-warm-sand bg-white px-4 py-3 text-navy placeholder-navy/40 transition focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div>
                                <label htmlFor="email" className="mb-2 flex items-center gap-2 text-sm font-medium text-navy dark:text-slate-200">
                                    <Mail className="h-4 w-4 text-navy/50 dark:text-slate-500" />
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full rounded-xl border border-warm-sand bg-white px-4 py-3 text-navy placeholder-navy/40 transition focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                    placeholder="you@university.edu"
                                />
                            </div>
                        </div>

                        {/* Category */}
                        <div>
                            <label htmlFor="category" className="mb-2 flex items-center gap-2 text-sm font-medium text-navy dark:text-slate-200">
                                <Tag className="h-4 w-4 text-navy/50 dark:text-slate-500" />
                                Category
                            </label>
                            <select
                                id="category"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full rounded-xl border border-warm-sand bg-white px-4 py-3 text-navy transition focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                            >
                                {CATEGORIES.map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Subject */}
                        <div>
                            <label htmlFor="subject" className="mb-2 flex items-center gap-2 text-sm font-medium text-navy dark:text-slate-200">
                                <MessageSquare className="h-4 w-4 text-navy/50 dark:text-slate-500" />
                                Subject
                            </label>
                            <input
                                type="text"
                                id="subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                required
                                maxLength={200}
                                className="w-full rounded-xl border border-warm-sand bg-white px-4 py-3 text-navy placeholder-navy/40 transition focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                placeholder="Brief description of your inquiry"
                            />
                        </div>

                        {/* Message */}
                        <div>
                            <label htmlFor="message" className="mb-2 block text-sm font-medium text-navy dark:text-slate-200">
                                Message
                            </label>
                            <textarea
                                id="message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                required
                                minLength={10}
                                maxLength={5000}
                                rows={6}
                                className="w-full resize-none rounded-xl border border-warm-sand bg-white px-4 py-3 text-navy placeholder-navy/40 transition focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                placeholder="Please describe your question, issue, or feedback in detail..."
                            />
                            <p className="mt-1 text-right text-xs text-navy/50 dark:text-slate-500">
                                {message.length}/5000
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={formState === "submitting"}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral to-rose-500 px-6 py-4 font-semibold text-white shadow-lg transition hover:from-coral/90 hover:to-rose-500/90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 dark:from-indigo-600 dark:to-violet-600 dark:hover:from-indigo-500 dark:hover:to-violet-500"
                        >
                            {formState === "submitting" ? (
                                <>
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="h-5 w-5" />
                                    Send Message
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Additional Info */}
                <div className="mt-8 text-center text-sm text-navy/60 dark:text-slate-500">
                    <p>
                        For urgent matters, you can also reach us at{" "}
                        <a href="mailto:support@unihood.app" className="font-medium text-coral hover:underline dark:text-indigo-400">
                            support@unihood.app
                        </a>
                    </p>
                </div>
            </div>
        </main>
    );
}
