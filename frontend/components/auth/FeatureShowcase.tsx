"use client";

import { Radar, Users, GraduationCap } from "lucide-react";

export default function FeatureShowcase() {
    const features = [
        {
            icon: Radar,
            title: "Campus Radar",
            description: "Discover classmates and activities happening around you in real-time.",
        },
        {
            icon: Users,
            title: "Social Circles",
            description: "Find your crowd, join groups, and never miss out on campus events.",
        },
        {
            icon: GraduationCap,
            title: "Student Identity",
            description: "One verified profile for all your academic and social interactions.",
        },
    ];

    return (
        <div className="mt-12 grid max-w-lg gap-8 sm:grid-cols-3 lg:grid-cols-1 lg:gap-6">
            {features.map((feature) => (
                <div key={feature.title} className="flex flex-col items-center text-center lg:flex-row lg:text-left lg:items-start lg:gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-[#b7222d] shadow-sm ring-1 ring-rose-100">
                        <feature.icon className="h-6 w-6" />
                    </div>
                    <div className="mt-4 lg:mt-0">
                        <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
