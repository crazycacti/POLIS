import { createHash } from "node:crypto";

import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { upstreamCallIsBackground } from "@/lib/upstream-priority";

export type UpstreamProvider = "tmdb" | "mdblist" | "fanart" | "tvdb" | "anilist" | "jikan" | "kitsu";

export type UpstreamKeySource = "server" | "profile" | "request";

export type UpstreamBlockReason = "rate_limited" | "auth_rejected" | "quota_low" | "profile_budget" | "busy";

export type UpstreamCallScope = {
  provider: UpstreamProvider;
  credentialFingerprint: string;
  serverKeyProfile?: string | null;
  background?: boolean;
  authFailureCooldown?: boolean;
};

type RateWindow = { limit: number; windowMs: number };

export type UpstreamProviderPolicy = {
  windows: RateWindow[];
  maxConcurrent: number;
  defaultCooldownMs: number;
  dailyLimit: () => number | null;
  dailyLimitBodyPattern?: RegExp;
};

type KeyState = {
  cooldownUntil: number;
  cooldownReason: "rate_limited" | "auth_rejected";
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  day: string;
  used: number;
};

type ProfileUsage = { day: string; used: number };

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_COOLDOWN_MS = DAY_MS;
const AUTH_FAILURE_COOLDOWN_MS = 15 * MINUTE_MS;
const DEFAULT_MAX_WAIT_MS = 2 * SECOND_MS;
const CONCURRENCY_RECHECK_MS = 25;
const LOW_QUOTA_FRACTION = 0.05;
const MAX_TRACKED_KEYS = 2_000;
const MAX_TRACKED_PROFILES = 5_000;
const MAX_WARNING_KEYS = 500;
const WARN_INTERVAL_MS = MINUTE_MS;
const EPOCH_SECONDS_THRESHOLD = 1_000_000_000;
const EPOCH_MILLISECONDS_THRESHOLD = 1_000_000_000_000;
const DEFAULT_MDBLIST_DAILY_LIMIT = 1_000;
const DEFAULT_SERVER_KEY_SHARE_PERCENT = 20;
const MAX_PERCENT = 100;

export const PUBLIC_UPSTREAM_CREDENTIAL = "public";

export const UPSTREAM_PROVIDER_POLICIES: Record<UpstreamProvider, UpstreamProviderPolicy> = {
  tmdb: {
    windows: [{ limit: 40, windowMs: SECOND_MS }],
    maxConcurrent: 20,
    defaultCooldownMs: 10 * SECOND_MS,
    dailyLimit: () => null,
  },
  mdblist: {
    windows: [{ limit: 10, windowMs: SECOND_MS }],
    maxConcurrent: 4,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => polisEnvPositiveInt("POLIS_MDBLIST_DAILY_LIMIT") ?? DEFAULT_MDBLIST_DAILY_LIMIT,
    dailyLimitBodyPattern: /daily api limit/i,
  },
  fanart: {
    windows: [{ limit: 10, windowMs: SECOND_MS }],
    maxConcurrent: 4,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
  },
  tvdb: {
    windows: [{ limit: 10, windowMs: SECOND_MS }],
    maxConcurrent: 4,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
  },
  anilist: {
    windows: [{ limit: 25, windowMs: MINUTE_MS }],
    maxConcurrent: 2,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
  },
  jikan: {
    windows: [
      { limit: 2, windowMs: SECOND_MS },
      { limit: 50, windowMs: MINUTE_MS },
    ],
    maxConcurrent: 2,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
  },
  kitsu: {
    windows: [
      { limit: 5, windowMs: SECOND_MS },
      { limit: 100, windowMs: MINUTE_MS },
    ],
    maxConcurrent: 2,
    defaultCooldownMs: MINUTE_MS,
    dailyLimit: () => null,
  },
};

export function upstreamCredentialFingerprint(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex").slice(0, 16);
}

const SECRET_QUERY_RE = /([?&](?:api_?key|apikey|token|access_token|tmdb_key|mdblist_key)=)[^&\s"']+/gi;
const BEARER_RE = /(Bearer\s+)[^\s"']+/gi;

export function redactUpstreamSecrets(text: string): string {
  return text.replace(SECRET_QUERY_RE, "$1REDACTED").replace(BEARER_RE, "$1REDACTED");
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function nextUtcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function headerNumber(headers: Headers, names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name)?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export function retryAfterMs(headers: Headers, now: number): number | null {
  const raw = headers.get("retry-after")?.trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * SECOND_MS;
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const reset = rateLimitResetAt(headers, now);
  return reset != null ? Math.max(0, reset - now) : null;
}

function rateLimitResetAt(headers: Headers, now: number): number | null {
  const reset = headerNumber(headers, ["x-ratelimit-reset", "ratelimit-reset"]);
  if (reset == null) return null;
  if (reset > EPOCH_MILLISECONDS_THRESHOLD) return reset;
  if (reset > EPOCH_SECONDS_THRESHOLD) return reset * SECOND_MS;
  return now + reset * SECOND_MS;
}

function serverKeySharePercent(): number {
  const percent = polisEnvPositiveInt("POLIS_SERVER_KEY_DAILY_SHARE_PER_PROFILE");
  return Math.min(MAX_PERCENT, percent ?? DEFAULT_SERVER_KEY_SHARE_PERCENT);
}

function setBounded<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export type UpstreamGuardOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
  policies?: Partial<Record<UpstreamProvider, UpstreamProviderPolicy>>;
  sharePercent?: () => number;
};

export type UpstreamGuardResult<T> = { ok: true; value: T } | { ok: false; reason: UpstreamBlockReason };

export class UpstreamGuard {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWaitMs: number;
  private readonly policies: Record<UpstreamProvider, UpstreamProviderPolicy>;
  private readonly sharePercent: () => number;
  private readonly windowHits = new Map<UpstreamProvider, number[]>();
  private readonly active = new Map<UpstreamProvider, number>();
  private readonly keys = new Map<string, KeyState>();
  private readonly profiles = new Map<string, ProfileUsage>();
  private readonly warnedAt = new Map<string, number>();

  constructor(options: UpstreamGuardOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.policies = { ...UPSTREAM_PROVIDER_POLICIES, ...options.policies };
    this.sharePercent = options.sharePercent ?? serverKeySharePercent;
  }

  warnOnce(key: string, message: string, error?: unknown): void {
    const now = this.now();
    const last = this.warnedAt.get(key);
    if (last != null && now - last < WARN_INTERVAL_MS) return;
    setBounded(this.warnedAt, key, now, MAX_WARNING_KEYS);
    const detail = error == null ? "" : `: ${redactUpstreamSecrets(error instanceof Error ? error.message : String(error))}`;
    console.warn(`[polis] ${redactUpstreamSecrets(message)}${detail}`);
  }

  private keyState(provider: UpstreamProvider, fingerprint: string): KeyState {
    const id = `${provider}\0${fingerprint}`;
    const today = utcDay(this.now());
    const existing = this.keys.get(id);
    if (existing) {
      if (existing.day !== today) {
        existing.day = today;
        existing.used = 0;
      }
      return existing;
    }
    const created: KeyState = {
      cooldownUntil: 0,
      cooldownReason: "rate_limited",
      limit: null,
      remaining: null,
      resetAt: null,
      day: today,
      used: 0,
    };
    setBounded(this.keys, id, created, MAX_TRACKED_KEYS);
    return created;
  }

  private profileUsage(scope: UpstreamCallScope, profile: string): ProfileUsage {
    const id = `${scope.provider}\0${scope.credentialFingerprint}\0${profile}`;
    const today = utcDay(this.now());
    const existing = this.profiles.get(id);
    if (existing && existing.day === today) return existing;
    const created: ProfileUsage = { day: today, used: 0 };
    setBounded(this.profiles, id, created, MAX_TRACKED_PROFILES);
    return created;
  }

  inCooldown(provider: UpstreamProvider, fingerprint: string): boolean {
    return this.cooldownReason(provider, fingerprint) != null;
  }

  private cooldownReason(provider: UpstreamProvider, fingerprint: string): UpstreamBlockReason | null {
    const state = this.keyState(provider, fingerprint);
    return state.cooldownUntil > this.now() ? state.cooldownReason : null;
  }

  blockedUntil(scope: UpstreamCallScope, reason: UpstreamBlockReason): number | null {
    const now = this.now();
    if (reason === "rate_limited" || reason === "auth_rejected") {
      const until = this.keyState(scope.provider, scope.credentialFingerprint).cooldownUntil;
      return until > now ? until : null;
    }
    if (reason === "profile_budget") return nextUtcMidnight(now);
    return null;
  }

  quotaLow(provider: UpstreamProvider, fingerprint: string): boolean {
    const state = this.keyState(provider, fingerprint);
    const now = this.now();
    if (
      state.limit != null &&
      state.remaining != null &&
      state.limit > 0 &&
      (state.resetAt == null || state.resetAt > now) &&
      state.remaining / state.limit < LOW_QUOTA_FRACTION
    ) {
      return true;
    }
    const daily = this.policies[provider].dailyLimit();
    return daily != null && state.used >= daily * (1 - LOW_QUOTA_FRACTION);
  }

  private profileBudget(provider: UpstreamProvider): number | null {
    const daily = this.policies[provider].dailyLimit();
    if (daily == null) return null;
    return Math.max(1, Math.floor((daily * this.sharePercent()) / MAX_PERCENT));
  }

  backgroundSkipReason(scope: UpstreamCallScope): UpstreamBlockReason | null {
    const cooldown = this.cooldownReason(scope.provider, scope.credentialFingerprint);
    if (cooldown) return cooldown;
    const background = scope.background ?? upstreamCallIsBackground();
    if (background && this.quotaLow(scope.provider, scope.credentialFingerprint)) return "quota_low";
    return null;
  }

  private overProfileBudget(scope: UpstreamCallScope): boolean {
    const profile = scope.serverKeyProfile;
    if (profile == null) return false;
    const budget = this.profileBudget(scope.provider);
    if (budget == null) return false;
    if (this.profileUsage(scope, profile).used < budget) return false;
    this.warnOnce(
      `${scope.provider}:budget:${upstreamCredentialFingerprint(profile)}`,
      `${scope.provider} server key share of ${budget} requests today is used up for profile ${upstreamCredentialFingerprint(profile).slice(0, 8)}, serving cached data`,
    );
    return true;
  }

  private windowWaitMs(provider: UpstreamProvider, now: number): number {
    const hits = this.windowHits.get(provider) ?? [];
    let wait = 0;
    for (const window of this.policies[provider].windows) {
      const inWindow = hits.filter((at) => now - at < window.windowMs);
      if (inWindow.length < window.limit) continue;
      const oldest = inWindow[inWindow.length - window.limit]!;
      wait = Math.max(wait, oldest + window.windowMs - now);
    }
    return wait;
  }

  private recordHit(provider: UpstreamProvider, now: number): void {
    const longest = Math.max(...this.policies[provider].windows.map((w) => w.windowMs));
    const hits = (this.windowHits.get(provider) ?? []).filter((at) => now - at < longest);
    hits.push(now);
    this.windowHits.set(provider, hits);
  }

  private async acquireSlot(provider: UpstreamProvider): Promise<(() => void) | null> {
    const deadline = this.now() + this.maxWaitMs;
    const policy = this.policies[provider];
    for (;;) {
      const now = this.now();
      const windowWait = this.windowWaitMs(provider, now);
      const busy = (this.active.get(provider) ?? 0) >= policy.maxConcurrent;
      if (windowWait === 0 && !busy) {
        this.recordHit(provider, now);
        this.active.set(provider, (this.active.get(provider) ?? 0) + 1);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          this.active.set(provider, Math.max(0, (this.active.get(provider) ?? 1) - 1));
        };
      }
      const wait = Math.max(windowWait, busy ? CONCURRENCY_RECHECK_MS : 0);
      if (now + wait > deadline) return null;
      await this.sleep(wait);
    }
  }

  observe(scope: UpstreamCallScope, response: Response, bodyText: string | null = null): void {
    const state = this.keyState(scope.provider, scope.credentialFingerprint);
    const now = this.now();
    const limit = headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
    const remaining = headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
    if (limit != null) state.limit = limit;
    if (remaining != null) {
      state.remaining = remaining;
      state.resetAt = rateLimitResetAt(response.headers, now);
    }

    if (response.status === 429) {
      const policy = this.policies[scope.provider];
      const dailyExhausted =
        policy.dailyLimit() != null &&
        (remaining === 0 || (bodyText != null && policy.dailyLimitBodyPattern?.test(bodyText) === true));
      const fallbackMs = dailyExhausted ? nextUtcMidnight(now) - now : policy.defaultCooldownMs;
      const cooldownMs = Math.min(MAX_COOLDOWN_MS, retryAfterMs(response.headers, now) ?? fallbackMs);
      this.startCooldown(state, now + cooldownMs, "rate_limited");
      this.warnOnce(
        `${scope.provider}:429:${scope.credentialFingerprint}`,
        `${scope.provider} rate limited this key, pausing calls for ${Math.ceil(cooldownMs / SECOND_MS)}s`,
      );
      return;
    }

    if ((response.status === 401 || response.status === 403) && scope.authFailureCooldown !== false) {
      this.startCooldown(state, now + AUTH_FAILURE_COOLDOWN_MS, "auth_rejected");
      this.warnOnce(
        `${scope.provider}:auth:${scope.credentialFingerprint}`,
        `${scope.provider} rejected this key with HTTP ${response.status}, pausing calls for 15 minutes`,
      );
    }
  }

  private startCooldown(state: KeyState, until: number, reason: KeyState["cooldownReason"]): void {
    if (until <= state.cooldownUntil) return;
    state.cooldownUntil = until;
    state.cooldownReason = reason;
  }

  async request<T>(
    scope: UpstreamCallScope,
    call: () => Promise<Response>,
    read: (response: Response) => Promise<T>,
  ): Promise<UpstreamGuardResult<T>> {
    const skip = this.backgroundSkipReason(scope);
    if (skip) return { ok: false, reason: skip };
    if (this.overProfileBudget(scope)) return { ok: false, reason: "profile_budget" };

    const release = await this.acquireSlot(scope.provider);
    if (!release) {
      this.warnOnce(`${scope.provider}:busy`, `${scope.provider} request budget is busy, serving cached data`);
      return { ok: false, reason: "busy" };
    }

    this.keyState(scope.provider, scope.credentialFingerprint).used += 1;
    if (scope.serverKeyProfile != null && this.profileBudget(scope.provider) != null) {
      this.profileUsage(scope, scope.serverKeyProfile).used += 1;
    }

    try {
      const response = await call();
      const bodyText =
        response.status === 429 ? await response.clone().text().catch(() => null) : null;
      this.observe(scope, response, bodyText);
      return { ok: true, value: await read(response) };
    } finally {
      release();
    }
  }
}

export const upstreamGuard = new UpstreamGuard();
