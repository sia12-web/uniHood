import type { ChatMessage } from "../lib/chat";

type Props = {
  message: ChatMessage;
  selfId: string;
};

export default function MessageItem({ message, selfId }: Props) {
  const mine = message.senderId === selfId;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-xs rounded px-3 py-2 text-sm ${mine ? "bg-blue-500 text-white" : "bg-slate-200"}`}>
        <div className="whitespace-pre-line">{message.body}</div>
        <div className="mt-1 text-xs opacity-70">#{message.seq}</div>
      </div>
    </div>
  );
}
