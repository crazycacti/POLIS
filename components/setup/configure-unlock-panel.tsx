"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function ConfigureUnlockPanel(props: {
  configId: string;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/config/${encodeURIComponent(props.configId)}/unlock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not unlock configuration.");
        return;
      }
      props.onUnlocked();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Unlock configuration</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Enter the password for profile{" "}
        <code className="font-mono text-xs text-zinc-400">{props.configId}</code>.
      </p>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-500">Password</span>
          <div className="relative">
            <input
              autoComplete="current-password"
              className="polis-input pr-10"
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              spellCheck={false}
              type={visible ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={visible ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-200"
              disabled={loading}
              onClick={() => setVisible((v) => !v)}
              type="button"
            >
              {visible ? (
                <EyeOff aria-hidden className="h-4 w-4" />
              ) : (
                <Eye aria-hidden className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>
        {error ? <p className="text-sm text-amber-200/95">{error}</p> : null}
        <button className="polis-btn text-sm" disabled={loading || !password.trim()} type="submit">
          {loading ? "Unlocking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
