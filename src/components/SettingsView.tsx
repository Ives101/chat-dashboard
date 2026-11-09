"use client";
import { useEffect, useState } from "react";
import PerfMonitor from "@/components/PerfMonitor";

type Settings = { name: string; email: string };
type Integration = { id: string; app: string; connected: number; config: Record<string, any>; updated_at: number };
type Webhook = { id: string; name: string; url: string; events: string[]; secret: string | null; enabled: number; created_at: number };

const APP_LABELS: Record<string, string> = {
  openai: "OpenAI",
  agy: "agy CLI (Antigravity)",
  grok: "grok CLI",
  opencode: "opencode CLI",
  qwen: "qwen CLI",
  slack: "Slack",
  discord: "Discord",
  generic: "Generic",
};

const WEBHOOK_EVENTS = ["message.created", "chat.created", "chat.deleted", "export.completed"];

export default function SettingsView({ onBack }: { onBack?: () => void }) {
  const [section, setSection] = useState<"account" | "integrations" | "performance">("account");
  const [settings, setSettings] = useState<Settings>({ name: "", email: "" });
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // webhook form
  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>([]);
  const [whSecret, setWhSecret] = useState("");
  const [editingWh, setEditingWh] = useState<string | null>(null);

  const loadAll = async () => {
    const [s, i, w] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/integrations").then((r) => r.json()),
      fetch("/api/webhooks").then((r) => r.json()),
    ]);
    setSettings(s);
    setIntegrations(i);
    setWebhooks(w);
  };

  useEffect(() => { loadAll(); }, []);

  async function saveSettings() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await res.json();
      setSettings(data);
      setStatus("Saved");
    } catch (e) {
      setStatus("Error saving");
    } finally {
      setSaving(false);
    }
  }

  async function toggleIntegration(app: string, connected: boolean, config?: Record<string, any>) {
    const integration = integrations.find((i) => i.app === app);
    const newConfig = config ?? integration?.config ?? {};
    const res = await fetch("/api/integrations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app, connected, config: newConfig }) });
    const data = await res.json();
    setIntegrations((prev) => prev.map((i) => (i.app === app ? data : i)));
  }

  async function saveIntegrationConfig(app: string, config: Record<string, any>) {
    const integration = integrations.find((i) => i.app === app);
    const res = await fetch("/api/integrations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app, connected: integration?.connected === 1, config }) });
    const data = await res.json();
    setIntegrations((prev) => prev.map((i) => (i.app === app ? data : i)));
    setStatus("Saved");
  }

  async function submitWebhook() {
    if (!whUrl.trim()) return;
    if (editingWh) {
      const res = await fetch("/api/webhooks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingWh, name: whName || "Webhook", url: whUrl, events: whEvents, secret: whSecret || null }) });
      const data = await res.json();
      setWebhooks((prev) => prev.map((w) => (w.id === editingWh ? data : w)));
    } else {
      const res = await fetch("/api/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: whName || "Webhook", url: whUrl, events: whEvents, secret: whSecret || null }) });
      const data = await res.json();
      setWebhooks((prev) => [data, ...prev]);
    }
    resetWhForm();
  }

  function resetWhForm() {
    setWhName("");
    setWhUrl("");
    setWhEvents([]);
    setWhSecret("");
    setEditingWh(null);
  }

  function startEditWh(w: Webhook) {
    setEditingWh(w.id);
    setWhName(w.name);
    setWhUrl(w.url);
    setWhEvents(w.events);
    setWhSecret(w.secret ?? "");
  }

  async function deleteWh(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  async function toggleWh(id: string, enabled: boolean) {
    const res = await fetch("/api/webhooks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) });
    const data = await res.json();
    setWebhooks((prev) => prev.map((w) => (w.id === id ? data : w)));
  }

  async function testWh(url: string) {
    const res = await fetch("/api/webhooks/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await res.json();
    alert(data.ok ? `Webhook OK (status ${data.status})` : `Webhook failed: ${data.error ?? data.status}`);
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Sub side menu */}
      <aside className="w-48 shrink-0 bg-[#1e1e2e] border-r border-gray-700 flex flex-col">
        <div className="p-3 font-semibold text-lg">Settings</div>
        <nav className="flex-1 px-2 space-y-1">
          <button
            onClick={() => setSection("account")}
            className={`w-full text-left px-3 py-2 rounded text-sm ${section === "account" ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            Account
          </button>
          <button
            onClick={() => setSection("integrations")}
            className={`w-full text-left px-3 py-2 rounded text-sm ${section === "integrations" ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            Integrations
          </button>
          <button
            onClick={() => setSection("performance")}
            className={`w-full text-left px-3 py-2 rounded text-sm ${section === "performance" ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            Performance
          </button>
        </nav>
        {onBack && (
          <div className="p-2 border-t border-gray-700">
            <button onClick={onBack} className="w-full text-xs py-1.5 rounded bg-gray-800 hover:bg-gray-700">← Back to chats</button>
          </div>
        )}
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 text-gray-100">
        {section === "account" && (
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold mb-4">Account settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {status && <span className="text-sm text-gray-400">{status}</span>}
              </div>
            </div>
          </div>
        )}

        {section === "performance" && (
          <div className="max-w-4xl">
            <PerfMonitor />
          </div>
        )}

        {section === "integrations" && (
          <div className="max-w-3xl space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Connected apps</h2>
              <p className="text-sm text-gray-400 mb-4">Connect external services and CLIs to your dashboard.</p>
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div key={integration.app} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/60 border border-gray-700">
                    <div className="flex-1">
                      <div className="font-medium">{APP_LABELS[integration.app] ?? integration.app}</div>
                      <div className="text-xs text-gray-400">{integration.connected ? "Connected" : "Not connected"}</div>
                      {integration.app === "openai" && (
                        <input
                          placeholder="API key (optional)"
                          value={integration.config?.apiKey ?? ""}
                          onChange={(e) => {
                            const cfg = { ...integration.config, apiKey: e.target.value };
                            setIntegrations((prev) => prev.map((i) => (i.app === integration.app ? { ...i, config: cfg } : i)));
                          }}
                          onBlur={() => saveIntegrationConfig(integration.app, { ...integration.config })}
                          className="mt-2 w-full px-3 py-1.5 rounded bg-gray-900 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => toggleIntegration(integration.app, integration.connected !== 1, integration.config)}
                      className={`ml-4 px-3 py-1.5 rounded text-sm font-medium ${integration.connected ? "bg-red-600/20 text-red-300 hover:bg-red-600/40" : "bg-blue-600 text-white hover:bg-blue-500"}`}
                    >
                      {integration.connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-2">Webhooks</h2>
              <p className="text-sm text-gray-400 mb-4">Add webhook URLs to receive event notifications.</p>

              {/* Form */}
              <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700 mb-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    placeholder="Name"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    className="px-3 py-2 rounded bg-gray-900 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    placeholder="https://example.com/webhook"
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    className="px-3 py-2 rounded bg-gray-900 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Events</div>
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={whEvents.includes(ev)}
                          onChange={(e) => {
                            setWhEvents((prev) => e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev));
                          }}
                        />
                        {ev}
                      </label>
                    ))}
                  </div>
                </div>
                <input
                  placeholder="Secret (optional)"
                  value={whSecret}
                  onChange={(e) => setWhSecret(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={submitWebhook}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                  >
                    {editingWh ? "Update webhook" : "Add webhook"}
                  </button>
                  {editingWh && (
                    <button onClick={resetWhForm} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="space-y-2">
                {webhooks.length === 0 && <div className="text-sm text-gray-500">No webhooks yet.</div>}
                {webhooks.map((w) => (
                  <div key={w.id} className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{w.name}</div>
                        <div className="text-xs text-gray-400 truncate">{w.url}</div>
                        <div className="text-xs text-gray-500 mt-1">{w.events.join(", ") || "no events"}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleWh(w.id, w.enabled !== 1)}
                          className={`text-xs px-2 py-1 rounded ${w.enabled ? "bg-green-600/20 text-green-300" : "bg-gray-700 text-gray-400"}`}
                        >
                          {w.enabled ? "Enabled" : "Disabled"}
                        </button>
                        <button onClick={() => testWh(w.url)} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">Test</button>
                        <button onClick={() => startEditWh(w)} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600">Edit</button>
                        <button onClick={() => deleteWh(w.id)} className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/40">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}