"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Flag,
  Users,
  FileCheck,
  Activity,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Mail,
  Loader2
} from "lucide-react";
import { NetworkProgressCircle } from "@/components/NetworkProgressCircle";
import { apiFetch } from "@/app/lib/http/client";

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
  {
    title: "User Messages",
    href: "/admin/contact",
    icon: Mail,
    color: "text-rose-600",
    bg: "bg-rose-50",
    description: "View and respond to user support requests.",
  },
];

type DashboardKPIs = {
  open_cases: number;
  resolved_today: number;
  avg_resolution_hours: number;
  pending_appeals: number;
  escalated_count: number;
};

type AuditLogEntry = {
  id: string;
  action: string;
  actor_id: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function AdminOverviewPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactCount, setContactCount] = useState<number>(0);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch KPIs from moderation dashboard
      const kpiData = await apiFetch<DashboardKPIs>("/api/mod/v1/admin/dashboard/kpis").catch(() => null);
      if (kpiData) {
        setKpis(kpiData);
      }

      // Fetch recent audit logs
      const auditData = await apiFetch<{ items: AuditLogEntry[] }>("/api/mod/v1/admin/audit?limit=5").catch(() => ({ items: [] }));
      setAuditLogs(auditData.items || []);

      // Fetch pending contact messages count
      const contactData = await apiFetch<{ total: number }>("/contact/admin?status=pending&limit=1").catch(() => ({ total: 0 }));
      setContactCount(contactData.total || 0);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const systemHealthScore = kpis ? Math.max(0, 100 - (kpis.escalated_count * 5) - (kpis.pending_appeals * 2)) : 100;
  const pendingReviews = (kpis?.open_cases || 0) + contactCount;

  return (
    <div className="space-y-8">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">System overview and quick actions</p>
        </div>
        <button
          type="button"
          onClick={fetchDashboardData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* System Health Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">System Health</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loading ? "—" : `${systemHealthScore.toFixed(1)}%`}
              </h3>
              <p className={`mt-1 text-xs flex items-center gap-1 ${systemHealthScore >= 90 ? "text-emerald-600" : systemHealthScore >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                <Activity className="h-3 w-3" />
                {systemHealthScore >= 90 ? "All systems operational" : systemHealthScore >= 70 ? "Some issues require attention" : "Critical issues detected"}
              </p>
            </div>
            <div className={systemHealthScore >= 90 ? "text-emerald-500" : systemHealthScore >= 70 ? "text-amber-500" : "text-rose-500"}>
              <NetworkProgressCircle score={systemHealthScore} size={60} strokeWidth={6} />
            </div>
          </div>
        </div>

        {/* Resolved Today Card */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Resolved Today</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loading ? <Loader2 className="h-8 w-8 animate-spin text-slate-300" /> : kpis?.resolved_today ?? 0}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Avg resolution: {kpis?.avg_resolution_hours?.toFixed(1) ?? "—"}h
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
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loading ? <Loader2 className="h-8 w-8 animate-spin text-slate-300" /> : pendingReviews}
              </h3>
              <p className={`mt-1 text-xs flex items-center gap-1 ${pendingReviews > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {pendingReviews > 0 ? (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    Requires attention
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    All clear
                  </>
                )}
              </p>
            </div>
            <div className={`rounded-xl p-3 ${pendingReviews > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
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
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                </div>
              ) : auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900">{log.action}</p>
                      <span className="text-xs text-slate-400">{formatRelativeTime(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.target_id ? `Target: ${log.target_id.slice(0, 8)}...` : "System action"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-slate-200" />
                      <span className="text-xs text-slate-400">{log.actor_id.slice(0, 12)}...</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Activity className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">No recent activity</p>
                </div>
              )}
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
