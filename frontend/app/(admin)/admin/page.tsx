"use client";

import Link from "next/link";
import { 
  ShieldCheck, 
  Flag, 
  Users, 
  FileCheck, 
  Activity, 
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { NetworkProgressCircle } from "@/components/NetworkProgressCircle";

const ADMIN_FEATURES = [
  {
    title: "Policy & Consent",
    href: "/admin/consent",
    icon: FileCheck,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "Manage legal policies and track acceptance rates across campuses.",
  },
  {
    title: "Feature Flags",
    href: "/admin/flags",
    icon: Flag,
    color: "text-violet-600",
    bg: "bg-violet-50",
    description: "Control feature rollouts and campus-specific overrides.",
  },
  {
    title: "Roles & Permissions",
    href: "/admin/rbac",
    icon: Users,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Configure staff roles and access levels.",
  },
  {
    title: "Verification Queue",
    href: "/admin/verification",
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-50",
    description: "Review pending identity verifications.",
  },
];

const MOCK_LOGS = [
  { id: 1, action: "Flag Updated", detail: "Enabled 'ui.moderation.v2' for Campus A", user: "admin@divan.dev", time: "2m ago" },
  { id: 2, action: "User Verified", detail: "Approved verification for user_123", user: "mod_sarah", time: "15m ago" },
  { id: 3, action: "Policy Published", detail: "Updated Privacy Policy v1.2", user: "legal_team", time: "1h ago" },
  { id: 4, action: "Role Assigned", detail: "Granted 'Moderator' role to user_456", user: "admin@divan.dev", time: "3h ago" },
];

export default function AdminOverviewPage() {
  return (
    <div className="space-y-8">
      {/* Hero / Stats Row */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* System Health Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">System Health</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">98.2%</h3>
              <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                <Activity className="h-3 w-3" />
                All systems operational
              </p>
            </div>
            <div className="text-emerald-500">
              <NetworkProgressCircle score={98} size={60} strokeWidth={6} className="text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Active Sessions Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Sessions</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">1,248</h3>
              <p className="mt-1 text-xs text-slate-500">
                +12% from last hour
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Pending Actions Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Reviews</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">14</h3>
              <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Requires attention
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Quick Actions (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold text-slate-900">Management Console</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ADMIN_FEATURES.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`mb-4 inline-flex rounded-lg ${feature.bg} p-3 ${feature.color}`}>
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-slate-900 group-hover:text-violet-600">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-500">{feature.description}</p>
                <div className="absolute bottom-4 right-4 opacity-0 transition-opacity group-hover:opacity-100">
                  <ArrowRight className="h-5 w-5 text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Activity Feed (1/3 width) */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-900">Recent Audit Logs</h2>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {MOCK_LOGS.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{log.action}</p>
                    <span className="text-xs text-slate-400">{log.time}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{log.detail}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-slate-200" />
                    <span className="text-xs text-slate-400">{log.user}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 bg-slate-50 p-3 text-center">
              <Link href="/admin/mod/audit" className="text-xs font-medium text-violet-600 hover:text-violet-700">
                View Full Audit Log
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
