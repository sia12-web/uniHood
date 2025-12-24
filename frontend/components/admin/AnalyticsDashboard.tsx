"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    adminAnalytics,
    AnalyticsOverview,
    PopularGameItem,
    PopularMeetupTypeItem,
    ActivityLogItem,
} from "@/lib/admin-analytics";

export function AnalyticsDashboard() {
    const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
    const [popularGames, setPopularGames] = useState<PopularGameItem[]>([]);
    const [popularMeetups, setPopularMeetups] = useState<PopularMeetupTypeItem[]>([]);
    const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const [ov, games, meetups, logs] = await Promise.all([
                    adminAnalytics.getOverview(),
                    adminAnalytics.getPopularGames(),
                    adminAnalytics.getPopularMeetupTypes(),
                    adminAnalytics.getActivityLog(),
                ]);
                setOverview(ov);
                setPopularGames(games);
                setPopularMeetups(meetups);
                setActivityLog(logs);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) return <div className="p-8 text-center">Loading analytics...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-8 p-6">
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>

            {/* Overview Cards */}
            {overview && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="Total Meetups" value={overview.total_meetups_created} />
                    <StatCard title="Total Games Played" value={overview.total_games_played} />
                    <StatCard title="Active Meetups" value={overview.active_meetups_count} />
                    <StatCard title="Active Games" value={overview.active_games_count} />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Popular Games */}
                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4">Most Played Games</h2>
                    <div className="space-y-4">
                        {popularGames.map((game) => (
                            <div key={game.game_kind} className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                <span className="font-medium capitalize">{game.game_kind.replace("_", " ")}</span>
                                <span className="text-purple-400 font-bold">{game.play_count} plays</span>
                            </div>
                        ))}
                        {popularGames.length === 0 && <div className="text-gray-400">No data yet.</div>}
                    </div>
                </div>

                {/* Popular Meetup Types */}
                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4">Popular Meetup Categories</h2>
                    <div className="space-y-4">
                        {popularMeetups.map((type) => (
                            <div key={type.category} className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                <span className="font-medium capitalize">{type.category}</span>
                                <span className="text-blue-400 font-bold">{type.count} created</span>
                            </div>
                        ))}
                        {popularMeetups.length === 0 && <div className="text-gray-400">No data yet.</div>}
                    </div>
                </div>
            </div>

            {/* Activity Log */}
            <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                <h2 className="text-xl font-semibold mb-4">Recent User Activity</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400">
                                <th className="pb-2">User</th>
                                <th className="pb-2">Action</th>
                                <th className="pb-2">Details</th>
                                <th className="pb-2">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {activityLog.map((log) => (
                                <tr key={log.id}>
                                    <td className="py-3 items-center gap-2 flex">
                                        {log.user_avatar_url && (
                                            <Image src={log.user_avatar_url} alt="" width={24} height={24} className="w-6 h-6 rounded-full" />
                                        )}
                                        <span className="text-sm">{log.user_display_name || log.user_id.slice(0, 8)}</span>
                                    </td>
                                    <td className="py-3 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs ${log.event.startsWith('meetup') ? 'bg-blue-500/20 text-blue-300' :
                                            log.event.startsWith('activity') ? 'bg-purple-500/20 text-purple-300' :
                                                'bg-gray-500/20 text-gray-300'
                                            }`}>
                                            {log.event}
                                        </span>
                                    </td>
                                    <td className="py-3 text-xs text-gray-400 max-w-xs truncate">
                                        {JSON.stringify(log.meta)}
                                    </td>
                                    <td className="py-3 text-xs text-gray-500">
                                        {new Date(log.created_at).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                            {activityLog.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">No activity yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="bg-white/5 p-6 rounded-xl border border-white/10 flex flex-col items-center">
            <span className="text-gray-400 text-sm">{title}</span>
            <span className="text-4xl font-bold mt-2">{value}</span>
        </div>
    );
}
