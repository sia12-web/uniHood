import { useState, useEffect } from "react";
import { fetchDailyChecklist, type DailyChecklist } from "@/lib/xp";
import { useAuth } from "@/components/providers/auth-provider";

export function useDailyChecklist() {
    const { user } = useAuth();
    const [checklist, setChecklist] = useState<DailyChecklist | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) {
            setChecklist(null);
            return;
        }

        const load = async () => {
            setLoading(true);
            try {
                const data = await fetchDailyChecklist();
                setChecklist(data);
            } catch (err) {
                console.error("Failed to load daily checklist", err);
            } finally {
                setLoading(false);
            }
        };

        void load();

        // Refresh periodically or on focus could be added here
        const interval = setInterval(load, 60000); // Check every minute
        return () => clearInterval(interval);

    }, [user]);

    return { checklist, loading };
}
