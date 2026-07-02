"use client";

import { useState, useCallback } from "react";

export type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
};

export function useChatStream(analysisId?: string) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);

  // append: sends toSend[] to /api/chat, streams reply into messages, returns final text.
  // hidden flag on messages is UI-only — all messages reach Claude for context.
  const append = useCallback(
    async (toSend: ChatMsg[]): Promise<string> => {
      setLoading(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: toSend.map((m) => ({ role: m.role, content: m.content })),
            analysisId,
          }),
        });
        if (!res.ok || !res.body) throw new Error();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: text },
          ]);
        }
        return text;
      } catch {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "Something went wrong. Try again." },
        ]);
        return "";
      } finally {
        setLoading(false);
      }
    },
    [analysisId]
  );

  const reset = useCallback(() => setMessages([]), []);

  return { messages, setMessages, loading, append, reset };
}
