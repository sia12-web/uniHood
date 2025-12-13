"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldAlert,
  Flag,
  Users,
  FileCheck,
  Settings,
  Activity,
  LogOut,
  Mail
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Moderation", href: "/admin/mod/triage", icon: ShieldAlert },
  { label: "Contact Messages", href: "/admin/contact", icon: Mail },
  { label: "Verification", href: "/admin/verification", icon: FileCheck },
  { label: "Feature Flags", href: "/admin/flags", icon: Flag },
  { label: "Permissions", href: "/admin/rbac", icon: Users },
  { label: "Policies", href: "/admin/consent", icon: FileCheck }, // Reusing icon for now
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-800 bg-slate-900 text-slate-300 transition-transform">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Settings className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Campus Ops</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-600/10 text-violet-400"
                    : "hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-violet-400" : "text-slate-500 group-hover:text-white")} />
                {item.label}
              </Link>
            );
          })}

          <div className="my-4 border-t border-slate-800 mx-3" />

          <div className="px-3">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">System</p>
            <Link
              href="/admin/mod/audit"
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                pathname === "/admin/mod/audit" ? "bg-violet-600/10 text-violet-400" : "hover:bg-slate-800 hover:text-white"
              )}
            >
              <Activity className="h-5 w-5 text-slate-500 group-hover:text-white" />
              Audit Logs
            </Link>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4">
          <Link
            href="/"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            Exit Console
          </Link>
        </div>
      </div>
    </aside>
  );
}
