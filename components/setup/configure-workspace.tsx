"use client";

import { useCallback, useEffect, useState } from "react";

import { ConfigureUnlockPanel } from "@/components/setup/configure-unlock-panel";
import { SetupWorkspace } from "@/components/setup/setup-workspace";
import type { ConfigurePageServerProps } from "@/lib/configure-page";

export function ConfigureWorkspace(
  props: ConfigurePageServerProps & {
    routeConfigId?: string;
  },
) {
  const configId = props.routeConfigId?.trim() || null;
  const [authChecked, setAuthChecked] = useState(!configId);
  const [authenticated, setAuthenticated] = useState(!configId);
  const [hasPassword, setHasPassword] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);

  const checkAuth = useCallback(async () => {
    if (!configId) return;
    try {
      const res = await fetch(`/api/config/${encodeURIComponent(configId)}/auth`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setConfigMissing(true);
        setAuthChecked(true);
        return;
      }
      const data = (await res.json()) as {
        authenticated?: boolean;
        hasPassword?: boolean;
      };
      setHasPassword(Boolean(data.hasPassword));
      setAuthenticated(Boolean(data.authenticated));
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, [configId]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (configMissing) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-white">Profile not found</h1>
        <p className="mt-2 text-sm text-zinc-500">
          No configuration exists for this id. Start a new profile at{" "}
          <a className="text-cyan-400/90 underline" href="/configure">
            /configure
          </a>
          .
        </p>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  if (configId && hasPassword && !authenticated) {
    return (
      <ConfigureUnlockPanel
        configId={configId}
        onUnlocked={() => {
          setAuthenticated(true);
        }}
      />
    );
  }

  const lockedConfigId = configId ?? undefined;

  return (
    <SetupWorkspace
      {...props}
      fixedConfigId={lockedConfigId}
      pageTitle={lockedConfigId ? "Configure addon" : "Configure POLIS"}
      pageHint={
        lockedConfigId
          ? "Update overlays and catalogs for this profile."
          : "Tune posters, then save to get your install URL."
      }
    />
  );
}
