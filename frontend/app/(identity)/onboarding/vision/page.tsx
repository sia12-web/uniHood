"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VisionPage() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/vision");
	}, [router]);

	return null;
}
