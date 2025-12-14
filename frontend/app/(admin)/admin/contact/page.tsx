"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Clock, Tag, User, MessageSquare, XCircle, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/app/lib/http/client";
import { cn } from "@/lib/utils";

type ContactMessage = {
    id: string;
    user_id: string | null;
    name: string;
    email: string;
    subject: string;
    message: string;
    category: string;
    status: string;
    created_at: string;
    updated_at: string;
    admin_notes: string | null;
};

type ContactListResponse = {
    items: ContactMessage[];
    total: number;
    has_more: boolean;
};

const STATUS_OPTIONS = [
    { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
    { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
    { value: "resolved", label: "Resolved", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
    { value: "closed", label: "Closed", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
];

const CATEGORY_LABELS: Record<string, string> = {
    general: "General",
    bug: "Bug Report",
    feature: "Feature Request",
    account: "Account Issue",
    abuse: "Report Abuse",
    other: "Other",
};

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function StatusBadge({ status }: { status: string }) {
    const option = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
    return (
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", option.color)}>
            {option.label}
        </span>
    );
}

export default function ContactMessagesPage() {
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [updating, setUpdating] = useState(false);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            const response = await apiFetch<ContactListResponse>(`/contact/admin?${params.toString()}`);
            setMessages(response.items);
            setTotal(response.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load messages");
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    const updateStatus = async (messageId: string, newStatus: string, notes?: string) => {
        setUpdating(true);
        try {
            const updated = await apiFetch<ContactMessage>(`/contact/admin/${messageId}`, {
                method: "PATCH",
                body: JSON.stringify({ status: newStatus, admin_notes: notes }),
            });
            setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
            if (selectedMessage?.id === messageId) {
                setSelectedMessage(updated);
            }
        } catch (err) {
            console.error("Failed to update status:", err);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Contact Messages</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {total} total message{total !== 1 ? "s" : ""}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <option value="">All Status</option>
                        {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={fetchMessages}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Content */}
            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
                    <XCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
                    <p className="font-medium text-red-800 dark:text-red-300">{error}</p>
                    <button
                        type="button"
                        onClick={fetchMessages}
                        className="mt-3 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                        Try again
                    </button>
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                </div>
            ) : messages.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-800">
                    <Mail className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
                    <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No messages yet</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Contact form submissions will appear here.</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Message List */}
                    <div className="space-y-3">
                        {messages.map((msg) => (
                            <button
                                key={msg.id}
                                type="button"
                                onClick={() => setSelectedMessage(msg)}
                                className={cn(
                                    "w-full rounded-xl border p-4 text-left transition",
                                    selectedMessage?.id === msg.id
                                        ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/30"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{msg.subject}</p>
                                        <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                            <User className="h-3.5 w-3.5" />
                                            {msg.name}
                                            <span className="text-slate-300 dark:text-slate-600">•</span>
                                            {msg.email}
                                        </p>
                                    </div>
                                    <StatusBadge status={msg.status} />
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{msg.message}</p>
                                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Tag className="h-3 w-3" />
                                        {CATEGORY_LABELS[msg.category] || msg.category}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatDate(msg.created_at)}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Message Detail */}
                    {selectedMessage ? (
                        <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
                            <div className="mb-4 flex items-start justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selectedMessage.subject}</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        From {selectedMessage.name} &lt;{selectedMessage.email}&gt;
                                    </p>
                                </div>
                                <StatusBadge status={selectedMessage.status} />
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    <Tag className="h-3 w-3" />
                                    {CATEGORY_LABELS[selectedMessage.category] || selectedMessage.category}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(selectedMessage.created_at)}
                                </span>
                                {selectedMessage.user_id && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                        <User className="h-3 w-3" />
                                        Registered user
                                    </span>
                                )}
                            </div>

                            <div className="mb-6 rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedMessage.message}</p>
                            </div>

                            {selectedMessage.admin_notes && (
                                <div className="mb-6">
                                    <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Admin Notes</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{selectedMessage.admin_notes}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                                <h3 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">Update Status</h3>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={updating || selectedMessage.status === opt.value}
                                            onClick={() => updateStatus(selectedMessage.id, opt.value)}
                                            className={cn(
                                                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                                selectedMessage.status === opt.value
                                                    ? "cursor-default bg-violet-600 text-white"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
                                                updating && "opacity-50"
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-4">
                                    <a
                                        href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject)}`}
                                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                                    >
                                        <Mail className="h-4 w-4" />
                                        Reply via Email
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-12 dark:border-slate-600">
                            <div className="text-center">
                                <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                                <p className="text-sm text-slate-500 dark:text-slate-400">Select a message to view details</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
