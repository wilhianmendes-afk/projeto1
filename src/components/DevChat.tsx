"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, Paperclip, Loader2 } from "lucide-react";

interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  read_at: string | null;
  created_at: string;
}

export default function DevChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const isOpenRef = useRef(isOpen);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  const fetchMessages = useCallback(async () => {
    const r = await fetch("/api/dev-chat").catch(() => null);
    if (!r?.ok) return;
    const data: Message[] = await r.json();
    setMessages(data);
    if (!isOpenRef.current) {
      setUnreadCount(data.filter((m) => m.role === "user" && !m.read_at).length);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchMessages]);

  useEffect(() => {
    if (!isOpen) return;
    setUnreadCount(0);
    // Mark unread user messages as read
    messages
      .filter((m) => m.role === "user" && !m.read_at)
      .forEach((m) => {
        fetch(`/api/dev-chat/${m.id}/read`, { method: "PATCH" }).catch(() => {});
      });
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    setSending(true);

    const form = new FormData();
    form.append("content", text || "(anexo)");
    pendingFiles.forEach((f) => form.append("files", f));

    setInput("");
    setPendingFiles([]);

    await fetch("/api/dev-chat", { method: "POST", body: form }).catch(() => {});
    await fetchMessages();
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function removeFile(i: number) {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="Chat do Dev"
        className="fixed bottom-20 md:bottom-6 right-4 z-50 w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-xl flex items-center justify-center transition-colors"
      >
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-20 z-50 flex flex-col w-[340px] max-w-[calc(100vw-2rem)] h-[500px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm font-semibold text-white">Chat do Dev</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-gray-500 text-xs text-center mt-10">Nenhuma mensagem ainda.</p>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-gray-700 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words leading-snug">{m.content}</p>

                  {m.attachments?.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map((a, i) => (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100 truncate"
                        >
                          <span>{a.type.startsWith("image/") ? "🖼" : "📎"}</span>
                          <span className="truncate">{a.name}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  <p className={`text-[10px] mt-1 opacity-50 ${m.role === "user" ? "text-right" : ""}`}>
                    {fmt(m.created_at)}
                    {m.role === "user" && m.read_at && " ✓"}
                  </p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-700 rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending file chips */}
          {pendingFiles.length > 0 && (
            <div className="px-3 py-1.5 flex flex-wrap gap-1.5 border-t border-gray-700 bg-gray-850 flex-shrink-0" style={{ background: "#111827" }}>
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 bg-gray-700 text-gray-300 text-xs rounded px-2 py-0.5"
                >
                  <span className="max-w-[100px] truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-white ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="flex items-end gap-1.5 p-2 border-t border-gray-700 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFilePick}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Anexar arquivo"
              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-700 transition-colors flex-shrink-0 mb-0.5"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem… (Enter envia, Shift+Enter quebra linha)"
              rows={1}
              className="flex-1 bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-2 resize-none outline-none border border-gray-600 focus:border-blue-500 placeholder-gray-500 leading-snug"
              style={{ minHeight: "36px", maxHeight: "100px" }}
            />

            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && pendingFiles.length === 0)}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-1.5 rounded-lg transition-colors flex-shrink-0 mb-0.5"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
