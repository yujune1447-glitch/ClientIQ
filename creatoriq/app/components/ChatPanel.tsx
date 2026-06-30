"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Minimize2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  analysisId: string | null;
}

export function ChatPanel({ analysisId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPos({ x: window.innerWidth - 404, y: window.innerHeight - 580 });
  }, []);

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 380, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, analysisId }),
      });

      if (!res.ok || !res.body) {
        setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Try again." }]);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages([...newMessages, { role: "assistant", content: text }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-[#ff3040] rounded-full flex items-center justify-center shadow-lg hover:bg-[#e02030] transition-colors z-50"
        title="Ask AI"
      >
        <MessageCircle className="w-5 h-5 text-white" />
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 w-[372px] flex flex-col bg-[#111113] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y, height: 520 }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`flex items-center gap-2 px-4 py-3 border-b border-[#1f1f22] select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="w-5 h-5 bg-[#ff3040] rounded flex items-center justify-center shrink-0">
          <MessageCircle className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-semibold flex-1">AI Assistant</span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { setOpen(false); setMessages([]); }}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-500 mb-3">Ask anything about your channel</p>
            <div className="space-y-2">
              {[
                "Why are my top videos performing so well?",
                "What content should I make next?",
                "How can I improve my CTR?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="block w-full text-left text-xs text-zinc-500 hover:text-zinc-300 bg-[#0d0d0f] hover:bg-[#1a1a1d] border border-[#1f1f22] rounded-lg px-3 py-2 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] text-sm rounded-xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#ff3040] text-white"
                  : "bg-[#1c1c1f] text-zinc-200 border border-[#27272a]"
              }`}
            >
              {msg.content}
              {msg.role === "assistant" && msg.content === "" && loading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline text-zinc-500" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1f1f22] p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your channel..."
          disabled={loading}
          rows={1}
          className="flex-1 bg-[#0d0d0f] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 resize-none disabled:opacity-50 min-h-[36px] max-h-[120px]"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="w-9 h-9 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center justify-center shrink-0 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Send className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
