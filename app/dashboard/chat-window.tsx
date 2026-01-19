"use client";

import { type LastRunSummary } from "@/lib/training";
import { useState, useEffect, useRef } from "react";
import { getCoachMessages, sendCoachMessage, acceptRecommendation, rejectRecommendation } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { formatDistance, formatPace, DistanceUnit } from "@/lib/units";

interface ChatWindowProps {
  lastRun: LastRunSummary | null;
  onClose?: () => void;
  distanceUnit: DistanceUnit;
}

interface Message {
  id?: string;
  role: string;
  content: string;
  createdAt: Date;
  recommendation?: any;
  messageId?: string;
}

export default function ChatWindow({ lastRun, onClose, distanceUnit }: ChatWindowProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRecommendation, setPendingRecommendation] = useState<{ messageId: string; recommendation: any } | null>(null);
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
    const msgs = await getCoachMessages(30);
    // Deduplicate by ID to avoid showing the same message twice
    const messageMap = new Map<string, Message>();
    msgs.reverse().forEach((m) => {
      if (!messageMap.has(m.id)) {
        messageMap.set(m.id, {
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          messageId: m.id,
        });
      }
    });
    setMessages(Array.from(messageMap.values()));
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput("");
    setLoading(true);

    // Add user message optimistically
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const result = await sendCoachMessage(userMessage);
      
      // Reload messages from server to get real IDs and avoid duplicates
      // This replaces optimistic updates with actual data
      const msgs = await getCoachMessages(30);
      const messageMap = new Map<string, Message>();
      msgs.reverse().forEach((m) => {
        if (!messageMap.has(m.id)) {
          const msg: Message = {
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            messageId: m.id,
          };
          // If this is the assistant message with a recommendation, attach it
          if (m.id === result.messageId && result.hasRecommendation && result.recommendation) {
            msg.recommendation = result.recommendation;
            setPendingRecommendation({
              messageId: result.messageId,
              recommendation: result.recommendation,
            });
          }
          messageMap.set(m.id, msg);
        }
      });
      setMessages(Array.from(messageMap.values()));
    } catch (error) {
      console.error("Failed to send message:", error);
      // Remove optimistic user message on error
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "assistant", content: "Sorry, I encountered an error. Please try again.", createdAt: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRecommendation = async () => {
    if (!pendingRecommendation) return;

    setLoading(true);
    try {
      await acceptRecommendation(pendingRecommendation.messageId, pendingRecommendation.recommendation);
      setPendingRecommendation(null);
      await loadMessages();
      router.refresh();
    } catch (error) {
      console.error("Failed to accept recommendation:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRecommendation = async () => {
    if (!pendingRecommendation) return;

    setLoading(true);
    try {
      await rejectRecommendation(pendingRecommendation.messageId);
      setPendingRecommendation(null);
      await loadMessages();
    } catch (error) {
      console.error("Failed to reject recommendation:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium mb-1">Coach</h3>
          {lastRun && (
            <p className="text-xs text-gray-400">
              Last run: {formatDistance(lastRun.distanceKm * 1000, distanceUnit)} at {(() => {
                // Convert pace from /km to user's unit
                const paceSecondsPerMeter = lastRun.distanceKm > 0 
                  ? (lastRun.timeMinutes * 60) / (lastRun.distanceKm * 1000)
                  : 0;
                return formatPace(paceSecondsPerMeter, distanceUnit);
              })()}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-gray-200 text-xl"
          >
            ×
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 italic">
            Ask about your training, recent runs, or get recommendations for your plan.
          </div>
        )}
        {messages.map((msg) => {
          const hasRecommendation = msg.recommendation || 
            (pendingRecommendation && pendingRecommendation.messageId === msg.messageId);
          const rec = msg.recommendation || pendingRecommendation?.recommendation;

          return (
            <div
              key={msg.id || msg.messageId || `msg-${msg.createdAt.getTime()}-${msg.role}`}
              className={`${
                msg.role === "user" ? "text-right" : "text-left"
              }`}
            >
              <div
                className={`inline-block max-w-[85%] rounded-lg p-3 text-sm ${
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
                
                {/* Recommendation UI */}
                {hasRecommendation && rec && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs font-medium text-amber-400 mb-2">
                      💡 Recommendation
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{rec.description}</p>
                    {rec.reasoning && (
                      <p className="text-xs text-gray-500 italic mb-3">{rec.reasoning}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAcceptRecommendation}
                        disabled={loading}
                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={handleRejectRecommendation}
                        disabled={loading}
                        className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
  );
}
