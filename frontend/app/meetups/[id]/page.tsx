"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMeetup, joinMeetup, leaveMeetup, cancelMeetup } from "@/lib/meetups";
import RoomChat from "@/components/RoomChat";
import {
  fetchHistory,
  roomsSocket,
  onRoomsSocketStatus,
  getRoomsSocketStatus,
  RoomMessageDTO,
  RoomMessageSend,
  sendRoomMessage,
} from "@/lib/rooms";
import { useSocketStatus } from "@/app/lib/socket/useStatus";
import { Calendar, Clock, Users, LogOut, XCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// Helper to upsert messages - handles both regular and optimistic messages
function upsertMessage(prev: RoomMessageDTO[], incoming: RoomMessageDTO): RoomMessageDTO[] {
  // 1. Find exact ID match (real ID vs real ID)
  const idMatchIndex = prev.findIndex(m => !m.id.startsWith("temp-") && m.id === incoming.id);
  if (idMatchIndex >= 0 && !incoming.id.startsWith("temp-")) {
    // We already have this confirmed message, just update it (or ignore)
    const next = [...prev];
    next[idMatchIndex] = incoming;
    return next;
  }

  // 2. Find client-side ID match (optimistic replacement)
  if (incoming.client_msg_id) {
    const clientMatchIndex = prev.findIndex(m => m.client_msg_id === incoming.client_msg_id);
    if (clientMatchIndex >= 0) {
      const existing = prev[clientMatchIndex];

      // If the existing one is real and this is temp, ignore temp
      if (!existing.id.startsWith("temp-") && incoming.id.startsWith("temp-")) {
        return prev;
      }

      // Replace existing (temp or old confirmed with same client-id) with new confirmed
      const next = [...prev];
      next[clientMatchIndex] = incoming;
      return next.sort((a, b) => a.seq - b.seq);
    }
  }

  // 3. If it's a new message, add it and sort
  return [...prev, incoming].sort((a, b) => a.seq - b.seq);
}

export default function MeetupDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: meetup, isLoading, error } = useQuery({
    queryKey: ["meetup", id],
    queryFn: () => getMeetup(id),
    enabled: !!id,
  });

  const [messages, setMessages] = useState<RoomMessageDTO[]>([]);
  const [pendingClientIds, setPendingClientIds] = useState<Set<string>>(new Set());
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const roomsSocketStatus = useSocketStatus(onRoomsSocketStatus, getRoomsSocketStatus);

  const joinMutation = useMutation({
    mutationFn: () => joinMeetup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetup", id] }),
    onError: (err) => console.error("Join failed", err),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveMeetup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetup", id] }),
    onError: (err) => console.error("Leave failed", err),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelMeetup(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetup", id] }),
    onError: (err) => console.error("Cancel failed", err),
  });

  const participantNames = meetup?.participants.reduce((acc, p) => {
    if (p.display_name) {
      acc[p.user_id] = p.display_name;
    }
    return acc;
  }, {} as Record<string, string>);


  // Track which room's history has been fetched to avoid repeated fetches
  const historyFetchedRef = useRef<string | null>(null);
  const joinedRoomRef = useRef<string | null>(null);

  // Room socket connection logic with retry
  useEffect(() => {
    if (!meetup?.room_id || !meetup.is_joined) return;

    const roomId = meetup.room_id;
    let socket: ReturnType<typeof roomsSocket> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const tryConnect = () => {
      if (!mounted) return;

      try {
        socket = roomsSocket();
      } catch (err) {
        console.warn("Socket not ready yet, retrying in 1s", err);
        retryTimeout = setTimeout(tryConnect, 1000);
        return;
      }

      const handleMessage = (msg: RoomMessageDTO) => {
        if (msg.room_id === roomId && mounted) {
          setMessages((prev) => upsertMessage(prev, msg));
        }
      };

      const handleConnect = () => {
        if (!mounted) return;
        console.log("Socket connected/reconnected, joining room:", roomId);
        socket?.emit("room_join", { room_id: roomId });
        joinedRoomRef.current = roomId;
      };

      // Handle real-time participant updates
      const handleMemberJoined = (payload: { room_id: string; user_id: string }) => {
        if (payload.room_id === roomId && mounted) {
          console.log("Member joined:", payload.user_id);
          // Refetch meetup data to get updated participants list
          queryClient.invalidateQueries({ queryKey: ["meetup", id] });
        }
      };

      const handleMemberLeft = (payload: { room_id: string; user_id: string }) => {
        if (payload.room_id === roomId && mounted) {
          console.log("Member left:", payload.user_id);
          // Refetch meetup data to get updated participants list
          queryClient.invalidateQueries({ queryKey: ["meetup", id] });
        }
      };

      // Register listeners
      socket.on("room_msg_new", handleMessage);
      socket.on("connect", handleConnect);
      socket.on("room_member_joined", handleMemberJoined);
      socket.on("room_member_left", handleMemberLeft);

      // If already connected, emit room_join immediately
      if (socket.connected) {
        console.log("Socket already connected, joining room:", roomId);
        socket.emit("room_join", { room_id: roomId });
        joinedRoomRef.current = roomId;
      }
    };

    tryConnect();

    return () => {
      mounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (socket) {
        socket.off("room_msg_new");
        socket.off("connect");
        socket.off("room_member_joined");
        socket.off("room_member_left");
        if (joinedRoomRef.current === roomId) {
          socket.emit("room_leave", { room_id: roomId });
          joinedRoomRef.current = null;
        }
      }
    };
  }, [meetup?.room_id, meetup?.is_joined, queryClient, id]);

  // Re-join room when socket reconnects (status changes to connected)
  useEffect(() => {
    if (!meetup?.room_id || !meetup.is_joined) return;
    if (roomsSocketStatus !== "connected") return;

    const roomId = meetup.room_id;

    // Only rejoin if we're not already joined to this room
    if (joinedRoomRef.current === roomId) return;

    try {
      const socket = roomsSocket();
      if (socket.connected) {
        console.log("Socket status connected, rejoining room:", roomId);
        socket.emit("room_join", { room_id: roomId });
        joinedRoomRef.current = roomId;
      }
    } catch (err) {
      console.warn("Failed to rejoin room:", err);
    }
  }, [roomsSocketStatus, meetup?.room_id, meetup?.is_joined]);

  // Fetch history separately - only once per room to avoid overwriting optimistic messages
  useEffect(() => {
    const roomId = meetup?.room_id;
    if (!roomId || !meetup?.is_joined) return;

    // Only fetch if we haven't fetched for this room yet
    if (historyFetchedRef.current === roomId) return;
    historyFetchedRef.current = roomId;

    fetchHistory(roomId).then((res) => {
      setMessages((prev) => {
        // Merge history with existing messages, upsert handles deduplication
        let merged = [...prev];
        for (const msg of res.items) {
          merged = upsertMessage(merged, msg);
        }
        return merged;
      });
    }).catch(console.error);
  }, [meetup?.room_id, meetup?.is_joined]);

  // Polling fallback: fetch new messages periodically when socket is not connected
  // Skip polling if there are pending optimistic messages to avoid flickering
  useEffect(() => {
    const roomId = meetup?.room_id;
    if (!roomId || !meetup?.is_joined) return;

    // Don't poll if there are pending messages - let the send response handle it
    if (pendingClientIds.size > 0) return;

    // Poll less aggressively - only when socket is disconnected
    // When socket is connected, rely on real-time updates
    if (roomsSocketStatus === "connected") return;

    const pollInterval = 5000; // 5 seconds when disconnected

    const pollMessages = async () => {
      // Double-check no pending messages
      if (pendingClientIds.size > 0) return;

      try {
        const res = await fetchHistory(roomId);
        setMessages((prev) => {
          // Build a map of existing messages by their client_msg_id or id
          const existingByClientId = new Map<string, RoomMessageDTO>();
          const existingById = new Map<string, RoomMessageDTO>();

          for (const msg of prev) {
            if (msg.client_msg_id) existingByClientId.set(msg.client_msg_id, msg);
            existingById.set(msg.id, msg);
          }

          let merged = [...prev];

          for (const msg of res.items) {
            // Skip if we already have this exact message
            if (existingById.has(msg.id)) continue;

            // Check if this replaces an optimistic message
            if (msg.client_msg_id && existingByClientId.has(msg.client_msg_id)) {
              const existing = existingByClientId.get(msg.client_msg_id)!;
              if (existing.id.startsWith("temp-")) {
                // Replace optimistic with real
                merged = merged.filter(m => m.id !== existing.id);
              }
            }

            merged = upsertMessage(merged, msg);
          }

          return merged;
        });
      } catch (err) {
        console.warn("Polling failed:", err);
      }
    };

    const interval = setInterval(pollMessages, pollInterval);

    return () => clearInterval(interval);
  }, [meetup?.room_id, meetup?.is_joined, roomsSocketStatus, pendingClientIds.size]);


  const handleSendMessage = useCallback(async (payload: RoomMessageSend) => {
    if (!meetup?.room_id || !meetup?.current_user_id) return;

    const clientMsgId = payload.client_msg_id;

    // Track this as pending to pause polling
    setPendingClientIds(prev => new Set(prev).add(clientMsgId));

    // Create optimistic message to show immediately
    const optimisticMessage: RoomMessageDTO = {
      id: `temp-${clientMsgId}`,
      room_id: meetup.room_id,
      seq: Date.now(), // Temporary seq for sorting
      sender_id: meetup.current_user_id,
      client_msg_id: clientMsgId,
      kind: payload.kind,
      content: payload.content ?? null,
      media_key: payload.media_key ?? null,
      media_mime: payload.media_mime ?? null,
      media_bytes: payload.media_bytes ?? null,
      created_at: new Date().toISOString(),
    };

    // Add optimistic message immediately for instant feedback
    setMessages((prev) => upsertMessage(prev, optimisticMessage));

    try {
      // Send to server
      const msg = await sendRoomMessage(meetup.room_id, payload);
      // Update with real message from server - upsertMessage handles deduplication via client_msg_id
      setMessages((prev) => upsertMessage(prev, msg));
    } catch (err) {
      console.error("Failed to send message", err);
      // Don't remove optimistic message on error immediately
      // The backend sometimes returns 200 OK but fails to close the connection properly (ASGI error),
      // causing a client-side NetworkError even though the message was saved.
      // We'll let the polling/socket reconciliation handle the cleanup if it was actually saved.
      // setMessages((prev) => prev.filter((m) => m.client_msg_id !== clientMsgId));
    } finally {
      // Remove from pending after a short delay to allow state to settle
      setTimeout(() => {
        setPendingClientIds(prev => {
          const next = new Set(prev);
          next.delete(clientMsgId);
          return next;
        });
      }, 500);
    }
  }, [meetup?.room_id, meetup?.current_user_id]);

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !meetup) return <div className="p-8 text-center text-red-500">Meetup not found</div>;

  const isHost = meetup.my_role === "HOST";
  const startDate = new Date(meetup.start_at);

  return (
    <main className="h-[calc(100vh-64px)] bg-slate-50 p-4 md:p-8 overflow-hidden">
      <div className="mx-auto max-w-7xl h-full grid gap-6 lg:grid-cols-[1fr_350px] grid-rows-[auto_1fr] lg:grid-rows-1">

        {/* Left Column: Header + Chat */}
        <div className="flex flex-col h-full gap-4 overflow-hidden">
          {/* Header Card */}
          <div className="flex-shrink-0 rounded-3xl bg-white p-6 shadow-sm">
            {/* Back Button */}
            <button
              onClick={() => router.back()}
              className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {meetup.category}
                </span>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">{meetup.title}</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${meetup.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" :
                  meetup.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                    meetup.status === "ENDED" ? "bg-slate-100 text-slate-700" :
                      "bg-blue-100 text-blue-700"
                  }`}>
                  {meetup.status}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-6 text-sm font-medium text-slate-600">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span>{startDate.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({meetup.duration_min}m)</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span>{meetup.participants_count} / {meetup.capacity} participants</span>
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 min-h-0 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden relative">
            {meetup.is_joined && meetup.room_id && !leaveMutation.isPending ? (
              <RoomChat
                messages={messages}
                onSend={async (text) => handleSendMessage({ client_msg_id: crypto.randomUUID(), kind: "text", content: text })}
                connectionStatus={roomsSocketStatus}
                participantNames={participantNames}
                currentUserId={meetup.current_user_id}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="rounded-full bg-slate-100 p-4 mb-4">
                  <Users className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Join the conversation</h3>
                <p className="mt-2 text-slate-500 max-w-sm">
                  Join this meetup to chat with other participants and coordinate details.
                </p>
                {!meetup.is_joined && meetup.status !== "CANCELLED" && meetup.status !== "ENDED" && (
                  <button
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                    className="mt-6 rounded-xl bg-rose-600 px-8 py-3 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50 transition-colors"
                  >
                    {joinMutation.isPending ? "Joining..." : "Join Meetup"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Participants & Actions */}
        <div className="flex flex-col h-full gap-4 overflow-hidden">
          <div className="flex-1 rounded-3xl bg-white p-6 shadow-sm overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Participants</h3>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {meetup.participants.length}
              </span>
            </div>

            <div className="space-y-4">
              {meetup.participants.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    {p.avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.avatar_url} alt={p.display_name || "User"} className="h-10 w-10 rounded-full object-cover border border-slate-100" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                        {(p.display_name || "U")[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {p.display_name || `User ${p.user_id.slice(0, 4)}`}
                        {p.user_id === meetup.current_user_id && <span className="ml-2 text-[10px] text-slate-400">(You)</span>}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{p.role.toLowerCase()}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${p.status === "JOINED" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                    }`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions Card */}
          {(meetup.is_joined || isHost) && (
            <div className="flex-shrink-0 rounded-3xl bg-white p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Actions</h3>

              {meetup.is_joined && (
                <button
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Leave Meetup
                </button>
              )}

              {isHost && (
                <button
                  onClick={() => setIsCancelOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Meetup
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {isCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Cancel Meetup</h3>
            <p className="mt-2 text-sm text-slate-600">Please provide a reason for cancelling this meetup. This will be visible to all participants.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const reason = formData.get("reason") as string;
                if (reason) {
                  cancelMutation.mutate(reason);
                  setIsCancelOpen(false);
                }
              }}
              className="mt-4"
            >
              <textarea
                name="reason"
                required
                minLength={3}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder="e.g., Something came up..."
              />
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCancelOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Keep Meetup
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending}
                  className="rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
