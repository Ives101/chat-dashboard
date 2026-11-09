import { getSharedChat } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SharedChatPage({ params }: { params: { token: string } }) {
  const data = getSharedChat(params.token);
  if (!data) notFound();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h1 className="text-2xl font-bold">{data.chat.title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Shared chat · {data.messages.length} messages
          </p>
        </div>
        <div className="space-y-4">
          {data.messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-800/80 text-gray-100 rounded-bl-md border border-gray-700/50"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-4 border-t text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Shared from Chat Dashboard
        </div>
      </div>
    </div>
  );
}