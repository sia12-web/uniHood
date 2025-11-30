"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";


export default function WelcomePage() {
    const router = useRouter();

    return (
        <div className="w-full flex flex-col items-center p-4 sm:p-6">
            <div className="w-full max-w-2xl space-y-8 text-center">
                <div className="flex flex-col items-center">

                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
                        You&apos;re all set!
                    </h2>
                    <p className="mt-2 text-lg text-slate-600">
                        Welcome to Campus. Start exploring your community.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => router.push("/")}
                        className="inline-flex w-full justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2"
                    >
                        Go to Dashboard
                    </button>
                    <Link
                        href="/profile"
                        className="inline-flex w-full justify-center rounded-md border border-slate-200 px-4 py-3 text-base font-medium text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:ring-offset-2"
                    >
                        View Profile
                    </Link>
                    <Link
                        href="/chat"
                        className="inline-flex w-full justify-center rounded-md border border-slate-200 px-4 py-3 text-base font-medium text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:ring-offset-2"
                    >
                        Open Chats
                    </Link>
                </div>
            </div>
        </div>
    );
}
