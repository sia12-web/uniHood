import { useState, useEffect } from "react";
import { fetchDailyChecklist, type DailyChecklist } from "@/lib/xp";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

export function useDailyChecklist() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [checklist, setChecklist] = useState<DailyChecklist | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const sync = () => {
            setUser(readAuthUser());
        };
        sync();
        return onAuthChange(sync);
    }, []);

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

        // Refresh periodically
        const interval = setInterval(load, 60000); // Check every minute
        return () => clearInterval(interval);

    }, [user]);

    return { checklist, loading };
}
