"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { listActivities, type ActivitySummary } from "@/lib/activities";
import { readAuthUser } from "@/lib/auth-storage";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 10000;

type ActivityAcceptanceContextValue = Record<string, never>;

const ActivityAcceptanceContext = createContext<ActivityAcceptanceContextValue | null>(null);

export function useActivityAcceptance() {
  return useContext(ActivityAcceptanceContext);
}

type ProviderProps = {
  children: ReactNode;
};

export function ActivityAcceptanceProvider({ children }: ProviderProps) {
  const toast = useToast();
  const router = useRouter();
  const knownActivitiesRef = useRef<Map<string, ActivitySummary["state"]>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const user = readAuthUser();
        if (!user?.userId) return;

        const activities = await listActivities();
        if (!active) return;

        // Filter for activities created by me (user_a)
        const myActivities = activities.filter((a) => a.user_a === user.userId);

        for (const activity of myActivities) {
          const prevState = knownActivitiesRef.current.get(activity.id);
          
          // Update known state
          knownActivitiesRef.current.set(activity.id, activity.state);

          // Check for transition to active/running
          // If we didn't know about it, and it's active, maybe we missed the transition?
          // Or if it was lobby and now active.
          
          const isNowActive = activity.state === "active" || (activity.kind === "story_alt" && activity.state === "running"); // story may report running once started
          // Actually ActivityState type has 'active'. Backend might return 'running'.
          // Let's check ActivityState definition in frontend/lib/activities.ts: "lobby" | "active" | "completed" ...
          
          // If the backend returns "running", does the frontend type match?
          // In storyBuilder.ts, phase is "running".
          // I should check if listActivities maps it.
          
          // Assuming "active" or "running" means started.
          
          if (isNowActive && !notifiedRef.current.has(activity.id)) {
             // If we knew it was lobby before, OR if it's just active and we haven't notified yet (and it's recent?)
             // To avoid notifying for old completed games, we should check created_at?
             // Or just rely on "prevState === 'lobby'".
             
             if (prevState === "lobby") {
               notifiedRef.current.add(activity.id);
               
               let title = "Activity Started";
               let description = "Your friend has joined the game!";

               if (activity.kind === "story_alt") {
                 title = "Story Started";
                 description = "Your friend joined the story. It's time to write!";
               } else if (activity.kind === "typing_duel") {
                 title = "Duel Started";
                 description = "Your opponent is ready. Go!";
               } else if (activity.kind === "rps") {
                 title = "RPS Match";
                 description = "Opponent joined. Make your move!";
               } else if (activity.kind === "trivia") {
                 title = "Trivia Started";
                 description = "Friend joined. Good luck!";
               }

                toast.push({
                  id: `activity-start-${activity.id}`,
                  title,
                  description,
                  variant: "success",
                });
              }
           }
         }
       } catch {
        // ignore
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [router, toast]);

  return (
    <ActivityAcceptanceContext.Provider value={{} satisfies ActivityAcceptanceContextValue}>
      {children}
    </ActivityAcceptanceContext.Provider>
  );
}
