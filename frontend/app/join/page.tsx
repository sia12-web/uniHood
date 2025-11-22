"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";

export default function JoinRedirectPage() {
	useEffect(() => {
		redirect("/onboarding");
	}, []);
	return null;
}
