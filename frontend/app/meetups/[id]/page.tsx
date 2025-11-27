"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Calendar, Clock, Users, LogOut, XCircle } from "lucide-react";

// Helper to upsert messages (copied from RoomPage)
function upsertMessage(prev: RoomMessageDTO[], incoming: RoomMessageDTO): RoomMessageDTO[] {
  const existingIndex = prev.findIndex(
    (message) => message.id === incoming.id || (incoming.client_msg_id && message.client_msg_id === incoming.client_msg_id),
  );
  if (existingIndex >= 0) {
    const next = [...prev];
    next[existingIndex] = incoming;
    return next;
  }
  return [...prev, incoming].sort((a, b) => a.seq - b.seq);
}

export default function MeetupDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  // const router = useRouter();
  const queryClient = useQueryClient();

  const { data: meetup, isLoading, error } = useQuery({
    queryKey: ["meetup", id],
    queryFn: () => getMeetup(id),
    enabled: !!id,
  });

  const [messages, setMessages] = useState<RoomMessageDTO[]>([]);
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

  // Room logic
  useEffect(() => {
    if (!meetup?.room_id || !meetup.is_joined) return;

    const roomId = meetup.room_id;

    // Connect socket
    const socket = roomsSocket();
    socket.emit("room:join", { room_id: roomId });

    // Fetch history
    fetchHistory(roomId).then((res) => setMessages(res.items)).catch(console.error);

    const handleMessage = (msg: RoomMessageDTO) => {
      if (msg.room_id === roomId) {
        setMessages((prev) => upsertMessage(prev, msg));
      }
    };

    const handleConnect = () => {
      console.log("Socket reconnected, re-joining room:", roomId);
      socket.emit("room:join", { room_id: roomId });
    };

    socket.on("room:msg:new", handleMessage);
    socket.on("connect", handleConnect);

    return () => {
      socket.off("room:msg:new", handleMessage);
      socket.off("connect", handleConnect);
      socket.emit("room:leave", { room_id: roomId });
    };
  }, [meetup?.room_id, meetup?.is_joined]);

  const handleSendMessage = useCallback(async (payload: RoomMessageSend) => {
    if (!meetup?.room_id) return;
    try {
      const msg = await sendRoomMessage(meetup.room_id, payload);
      setMessages((prev) => upsertMessage(prev, msg));
    } catch (err) {
      console.error("Failed to send message", err);
    }
  }, [meetup?.room_id]);

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !meetup) return <div className="p-8 text-center text-red-500">Meetup not found</div>;

  const isHost = meetup.my_role === "HOST";
  const startDate = new Date(meetup.start_at);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {meetup.category}
                </span>
                <h1 className="mt-3 text-3xl font-bold text-slate-900">{meetup.title}</h1>
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

            <p className="mt-4 text-lg text-slate-700">{meetup.description || "No description provided."}</p>

            <div className="mt-6 flex flex-wrap gap-6 text-sm font-medium text-slate-600">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-400" />
                <span>{startDate.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-400" />
                <span>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({meetup.duration_min}m)</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-400" />
                <span>{meetup.participants_count} participants</span>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              {!meetup.is_joined && meetup.status !== "CANCELLED" && meetup.status !== "ENDED" && (
                <button
                  onClick={() => joinMutation.mutate()}
                  disabled={joinMutation.isPending}
                  className="rounded-xl bg-rose-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50"
                >
                  {joinMutation.isPending ? "Joining..." : "Join Meetup"}
                </button>
              )}

              {meetup.is_joined && (
                <button
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  Leave
                </button>
              )}

              <button
                onClick={() => setIsCancelOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-bold text-red-700 hover:bg-red-100"
              >
                <XCircle className="h-4 w-4" />
                Cancel Meetup
              </button>
              )}
            </div>
          </div>

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

          {meetup.is_joined && meetup.room_id && !leaveMutation.isPending && (
            <div className="h-[600px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <RoomChat
                messages={messages}
                onSend={async (text) => handleSendMessage({ client_msg_id: crypto.randomUUID(), kind: "text", content: text })}
                connectionStatus={roomsSocketStatus}
              />
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Participants</h3>
            <div className="mt-4 space-y-3">
              {meetup.participants.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200" /> {/* Avatar placeholder */}
                    <div>
                      <p className="text-sm font-semibold text-slate-900">User {p.user_id.slice(0, 4)}</p>
                      <p className="text-xs text-slate-500">{p.role}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${p.status === "JOINED" ? "text-emerald-600" : "text-slate-400"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
