'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ulid } from 'ulidx';

import RoomChat from '@/components/RoomChat';
import RoomHeader from '@/components/RoomHeader';
import RoomRoster from '@/components/RoomRoster';
import {
  fetchHistory,
  getRoom,
  kickMember,
  markRead,
  muteMember,
  roomsSocket,
  disconnectRoomsSocket,
  getRoomsSocketStatus,
  onRoomsSocketStatus,
  RoomDetail,
  RoomMemberSummary,
  RoomMessageDTO,
  RoomMessageSend,
  RoomRole,
  RoomSummary,
  sendRoomMessage,
} from '@/lib/rooms';
import { useSocketStatus } from '@/app/lib/socket/useStatus';

type Props = { params: { roomId: string } };

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

export default function RoomPage({ params }: Props) {
  const { roomId } = params;
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [members, setMembers] = useState<RoomMemberSummary[]>([]);
  const [messages, setMessages] = useState<RoomMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomsSocketStatus = useSocketStatus(onRoomsSocketStatus, getRoomsSocketStatus);
  const roomsReconnecting = roomsSocketStatus === 'reconnecting' || roomsSocketStatus === 'connecting';
  const roomsDisconnected = roomsSocketStatus === 'disconnected';

  const canModerate = room?.role === 'owner' || room?.role === 'moderator';

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const detail = await getRoom(roomId);
        if (cancelled) {
          return;
        }
        setRoom(detail);
        setMembers(detail.members);
        const history = await fetchHistory(roomId, { direction: 'backward', limit: 50 });
        if (!cancelled) {
          setMessages(history.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load room');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
  const socket = roomsSocket();
    const handleMessageNew = (message: RoomMessageDTO) => {
      if (message.room_id !== roomId) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, message));
    };

    const handleMemberJoined = (payload: { room_id: string; user_id: string; role: RoomRole }) => {
      if (payload.room_id !== roomId) {
        return;
      }
      setMembers((prev) => {
        if (prev.some((member) => member.user_id === payload.user_id)) {
          return prev;
        }
        return [
          ...prev,
          {
            user_id: payload.user_id,
            role: payload.role,
            muted: false,
            joined_at: new Date().toISOString(),
          },
        ];
      });
      setRoom((prev) => (prev ? { ...prev, members_count: prev.members_count + 1 } : prev));
    };

    const handleMemberLeft = (payload: { room_id: string; user_id: string }) => {
      if (payload.room_id !== roomId) {
        return;
      }
      setMembers((prev) => prev.filter((member) => member.user_id !== payload.user_id));
      setRoom((prev) =>
        prev
          ? { ...prev, members_count: Math.max(prev.members_count - 1, 0) }
          : prev,
      );
    };

    const handleMemberUpdated = (payload: { room_id: string; user_id: string; role: RoomRole; muted: boolean }) => {
      if (payload.room_id !== roomId) {
        return;
      }
      setMembers((prev) =>
        prev.map((member) =>
          member.user_id === payload.user_id
            ? { ...member, role: payload.role, muted: payload.muted }
            : member,
        ),
      );
    };

    const handleRoomUpdated = (summary: RoomSummary) => {
      if (summary.id !== roomId) {
        return;
      }
      setRoom((prev) => (prev ? { ...prev, ...summary } : prev));
    };

    socket.emit('room:join', { room_id: roomId });
    socket.on('room:msg:new', handleMessageNew);
    socket.on('room:member_joined', handleMemberJoined);
    socket.on('room:member_left', handleMemberLeft);
    socket.on('room:member_updated', handleMemberUpdated);
    socket.on('room:updated', handleRoomUpdated);

    return () => {
      socket.emit('room:leave', { room_id: roomId });
      socket.off('room:msg:new', handleMessageNew);
      socket.off('room:member_joined', handleMemberJoined);
      socket.off('room:member_left', handleMemberLeft);
      socket.off('room:member_updated', handleMemberUpdated);
      socket.off('room:updated', handleRoomUpdated);
      if (!socket.connected) {
        disconnectRoomsSocket();
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }
    const latest = messages[messages.length - 1];
    markRead(roomId, latest.seq).catch(() => undefined);
  }, [messages, roomId]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!room) {
        return;
      }
      const payload: RoomMessageSend = {
        client_msg_id: ulid(),
        kind: 'text',
        content: text,
      };
      try {
        const sent = await sendRoomMessage(room.id, payload);
        setMessages((prev) => upsertMessage(prev, sent));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
    [room],
  );

  const handleMute = useCallback(
    async (userId: string, muted: boolean) => {
      try {
        await muteMember(roomId, userId, muted);
        setMembers((prev) =>
          prev.map((member) =>
            member.user_id === userId ? { ...member, muted } : member,
          ),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update mute state');
      }
    },
    [roomId],
  );

  const handleKick = useCallback(
    async (userId: string) => {
      try {
        await kickMember(roomId, userId);
        setMembers((prev) => prev.filter((member) => member.user_id !== userId));
        setRoom((prev) =>
          prev
            ? { ...prev, members_count: Math.max(prev.members_count - 1, 0) }
            : prev,
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove member');
      }
    },
    [roomId],
  );

  const sortedMembers = useMemo(() => {
    const weight: Record<RoomRole, number> = { owner: 0, moderator: 1, member: 2 };
    return members
      .slice()
      .sort((a, b) => {
        const roleDiff = weight[a.role] - weight[b.role];
        if (roleDiff !== 0) {
          return roleDiff;
        }
        return a.user_id.localeCompare(b.user_id);
      });
  }, [members]);

  async function handleCopyJoinCode() {
    if (!room?.join_code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(room.join_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to copy join code');
    }
  }

  if (loading) {
    return <div className="p-8">Loading room…</div>;
  }

  if (!room) {
    return <div className="p-8 text-red-600">{error ?? 'Room unavailable'}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {error ? (
        <div className="bg-red-50 text-red-600 px-4 py-2 text-sm">{error}</div>
      ) : null}
      {roomsReconnecting ? (
        <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700" role="status" aria-live="polite">
          Reconnecting…
        </div>
      ) : null}
      {roomsDisconnected ? (
        <div className="bg-rose-50 px-4 py-2 text-xs text-rose-700" role="alert" aria-live="assertive">
          Connection lost. Messages will send when the connection returns.
        </div>
      ) : null}
      <RoomHeader
        name={room.name}
        capacity={room.capacity}
        preset={room.preset}
        visibility={room.visibility}
        membersCount={room.members_count}
        joinCode={room.role === 'owner' ? room.join_code : null}
        onCopyJoinCode={room.role === 'owner' ? handleCopyJoinCode : undefined}
      />
      <div className="flex flex-1 overflow-hidden">
        <RoomRoster members={sortedMembers} canModerate={canModerate} onMute={handleMute} onKick={handleKick} />
        <RoomChat messages={messages} onSend={handleSend} connectionStatus={roomsSocketStatus} />
      </div>
    </div>
  );
}