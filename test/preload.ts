import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tests must never open the real polis.sqlite, which .env or the default path would point to.
process.env.POLIS_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "polis-test-db-")), "polis.sqlite");
