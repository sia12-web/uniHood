"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyEmailRedirectContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    useEffect(() => {
        if (token) {
            router.replace(`/verify/${token}`);
        } else {
            router.replace("/");
        }
    }, [token, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-white text-slate-600">
            Redirecting to verification...
        </div>
    );
}

export default function VerifyEmailRedirect() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white text-slate-600">Loading...</div>}>
            <VerifyEmailRedirectContent />
        </Suspense>
    );
}
