import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";

export function createTestDatabase() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "wechat-workbench-test-"));
  const databaseUrl = `file:${path.join(dir, "test.sqlite")}`;
  const database = createDatabase(databaseUrl);
  migrateDatabase(database.sqlite);
  seedDatabase(database.db);
  return database;
}
