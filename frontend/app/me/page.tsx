"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { readAuthUser } from "@/lib/auth-storage";

export default function MeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = readAuthUser();
    if (!auth) {
      router.replace("/login");
      return;
    }
    const handle = auth.handle?.trim();
    if (handle) {
      router.replace(`/u/${handle}`);
      return;
    }
    router.replace("/settings/profile");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-10">
      <p className="text-sm text-slate-500 dark:text-slate-400">Loading your profile…</p>
    </main>
  );
}
