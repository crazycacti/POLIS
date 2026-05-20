import { mkdirSync } from "node:fs";
import path from "node:path";

import { Database } from "bun:sqlite";

let db: Database | null = null;

function dbPath(): string {
  const raw = process.env.POLIS_DB_PATH?.trim();
  if (raw) return path.resolve(raw);
  return path.join(process.cwd(), "polis.sqlite");
}

export function getPolisDb(): Database {
  if (db) return db;

  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file, { create: true });
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS user_configs (
      id TEXT PRIMARY KEY NOT NULL,
      poster_query TEXT NOT NULL,
      manifest_kind TEXT NOT NULL DEFAULT 'meta',
      catalogs_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(user_configs)")
    .all()
    .map((c) => c.name);
  if (!columns.includes("catalogs_json")) {
    db.run(`ALTER TABLE user_configs ADD COLUMN catalogs_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!columns.includes("tmdb_integrator_secret")) {
    db.run(`ALTER TABLE user_configs ADD COLUMN tmdb_integrator_secret TEXT`);
  }
  if (!columns.includes("mdblist_integrator_key")) {
    db.run(`ALTER TABLE user_configs ADD COLUMN mdblist_integrator_key TEXT`);
  }
  if (!columns.includes("label")) {
    db.run(`ALTER TABLE user_configs ADD COLUMN label TEXT`);
  }
  if (!columns.includes("password_hash")) {
    db.run(`ALTER TABLE user_configs ADD COLUMN password_hash TEXT`);
  }

  return db;
}
