"use client";

import { type LastRunSummary } from "@/lib/training";
import { useState, useEffect, useRef } from "react";
import { getCoachMessages, sendCoachMessage } from "@/lib/actions";

interface ChatPanelProps {
  lastRun: LastRunSummary;
  onClose: () => void;
}

export default function ChatPanel({ lastRun, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string; createdAt: Date }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = async () => {
    const msgs = await getCoachMessages(20);
    setMessages(
      msgs.reverse().map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }))
    );
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput("");
    setLoading(true);

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, createdAt: new Date() },
    ]);

    try {
      await sendCoachMessage(userMessage);
      await loadMessages();
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-end p-6">
      <div className="w-full max-w-md h-[600px] bg-[#0f0f0f] border border-gray-800 rounded-lg flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-medium">Coach</h3>
            <p className="text-xs text-gray-400 mt-1">
              Last run: {lastRun.distanceKm.toFixed(1)}km at {lastRun.pace}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500 italic">
              Ask about your training, plan adjustments, or how you felt on your last run.
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`${
                msg.role === "user" ? "text-right" : "text-left"
              }`}
            >
              <div
                className={`inline-block max-w-[80%] rounded-lg p-3 text-sm ${
                  msg.role === "user"
                    ? "bg-gray-800 text-gray-100"
                    : "bg-gray-900 text-gray-300 border border-gray-800"
                }`}
              >
                {msg.content.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-sm text-gray-500 italic">Thinking...</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your training..."
              className="flex-1 bg-[#0a0a0a] border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-gray-700"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-gray-800 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
