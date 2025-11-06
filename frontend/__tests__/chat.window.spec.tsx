import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import ChatWindow, { type ChatDisplayMessage } from "@/components/ChatWindow";

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

describe("ChatWindow", () => {
  const baseMessage: ChatDisplayMessage = {
    messageId: "msg-1",
    clientMsgId: "client-1",
    seq: 1,
    conversationId: "chat:me:friend",
    senderId: "friend",
    recipientId: "me",
    body: "Hello there",
    attachments: [],
    createdAt: new Date("2025-01-01T00:00:00Z").toISOString(),
    status: "delivered",
    isOwn: false,
    error: null,
  };

  it("renders messages", () => {
    render(
      <ChatWindow
        conversationId={"chat:me:friend"}
        onSend={async () => undefined}
        messages={[baseMessage]}
        friendName="friend"
        friendPresence={{ online: true }}
      />,
    );

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("friend")).toBeInTheDocument();
  });

  it("invokes onTyping when the user types", () => {
    const handleTyping = vi.fn();

    render(
      <ChatWindow
        conversationId={"chat:me:friend"}
        onSend={async () => undefined}
        messages={[baseMessage]}
        friendName="friend"
        onTyping={handleTyping}
      />,
    );

    const textarea = screen.getByPlaceholderText("Type a message");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    expect(handleTyping).toHaveBeenCalled();
  });

  it("submits messages and clears the draft", async () => {
    const handleSend = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatWindow
        conversationId={"chat:me:friend"}
        onSend={handleSend}
        messages={[baseMessage]}
        friendName="friend"
      />,
    );

    const textarea = screen.getByPlaceholderText("Type a message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   Hi there!   " } });
    fireEvent.submit(textarea.form!);

    await waitFor(() => expect(handleSend).toHaveBeenCalledWith("Hi there!"));
    await waitFor(() => expect(textarea.value).toBe(""));
  });
});
