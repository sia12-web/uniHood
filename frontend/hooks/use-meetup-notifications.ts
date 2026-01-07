"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { listMeetups, type MeetupResponse } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";

const POLL_INTERVAL_MS = 30_000; // Check every 30 seconds
const NOTIFICATION_STORAGE_KEY = "meetup_notifications_seen";

export interface MeetupNotification {
  id: string;
  meetup: MeetupResponse;
  type: "new_meetup";
  timestamp: number;
}

export function useMeetupNotifications() {
  const [hasNewMeetups, setHasNewMeetups] = useState(false);
  const [notifications, setNotifications] = useState<MeetupNotification[]>([]);
  const lastCheckRef = useRef<number>(Date.now());
  const seenMeetupIdsRef = useRef<Set<string>>(new Set());

  // Load seen meetup IDs from localStorage on mount
  useEffect(() => {
    const loadSeenIds = () => {
      try {
        const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        if (stored) {
          const seenIds = JSON.parse(stored) as string[];
          seenMeetupIdsRef.current = new Set(seenIds);
        }
      } catch {
        // Ignore storage errors
      }
    };

    loadSeenIds();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_STORAGE_KEY) {
        loadSeenIds();
        setHasNewMeetups(false);
        setNotifications([]);
      }
    };

    const handleCustomEvent = () => {
      setHasNewMeetups(false);
      setNotifications([]);
    };

    window.addEventListener("storage" as any, handleStorageChange);
    window.addEventListener("meetups_seen" as any, handleCustomEvent);

    return () => {
      window.removeEventListener("storage" as any, handleStorageChange);
      window.removeEventListener("meetups_seen" as any, handleCustomEvent);
    };
  }, []);

  // Check for new meetups
  const checkForNewMeetups = async () => {
    try {
      const authUser = readAuthUser();
      if (!authUser?.campusId) return;

      const meetups = await listMeetups(authUser.campusId);

      // Filter out meetups created by current user and already seen ones
      const newMeetups = meetups.filter(meetup => {
        const isNotMine = meetup.creator_user_id !== authUser.userId;
        const isNew = !seenMeetupIdsRef.current.has(meetup.id);
        const isRecent = new Date(meetup.created_at).getTime() > lastCheckRef.current - (24 * 60 * 60 * 1000); // Within 24 hours
        return isNotMine && isNew && isRecent;
      });

      if (newMeetups.length > 0) {
        const newNotifications: MeetupNotification[] = newMeetups.map(meetup => ({
          id: `meetup-${meetup.id}`,
          meetup,
          type: "new_meetup",
          timestamp: new Date(meetup.created_at).getTime()
        }));

        // Merge with existing notifications, deduplicating by meetup ID
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.meetup.id));
          const uniqueNew = newNotifications.filter(n => !existingIds.has(n.meetup.id));
          return [...uniqueNew, ...prev].slice(0, 10);
        });
        setHasNewMeetups(true);
      }

    } catch (error) {
      console.warn("Failed to check for new meetups:", error);
    }
  };

  // Mark notifications as seen
  const markAsSeen = useCallback(() => {
    if (notifications.length === 0 && !hasNewMeetups) return;

    const allMeetupIds = notifications.map(n => n.meetup.id);
    allMeetupIds.forEach(id => seenMeetupIdsRef.current.add(id));

    // Save to localStorage
    try {
      localStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(Array.from(seenMeetupIdsRef.current))
      );
    } catch {
      // Ignore storage errors
    }

    setHasNewMeetups(false);
    setNotifications([]);
    window.dispatchEvent(new CustomEvent("meetups_seen"));
  }, [notifications, hasNewMeetups]);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setHasNewMeetups(false);
  }, []);

  // Polling effect
  useEffect(() => {
    const authUser = readAuthUser();
    if (!authUser?.userId) return;

    // Initial check
    checkForNewMeetups();

    const interval = setInterval(checkForNewMeetups, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Update lastCheck timestamp periodically
  useEffect(() => {
    const interval = setInterval(() => {
      lastCheckRef.current = Date.now();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    hasNewMeetups,
    notifications,
    markAsSeen,
    clearNotifications
  };
}