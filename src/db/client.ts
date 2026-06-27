import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { databaseUrlToPath, readAppConfig } from "@/config/env";

import * as schema from "./schema";

export type WorkbenchDatabase = ReturnType<typeof drizzle<typeof schema>>;

let cached: { sqlite: Database.Database; db: WorkbenchDatabase } | null = null;

export function createSqliteConnection(databaseUrl = readAppConfig().databaseUrl): Database.Database {
  const databasePath = databaseUrlToPath(databaseUrl);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function createDatabase(databaseUrl = readAppConfig().databaseUrl) {
  const sqlite = createSqliteConnection(databaseUrl);
  return {
    sqlite,
    db: drizzle(sqlite, { schema })
  };
}

export function getDatabase() {
  if (!cached) {
    cached = createDatabase();
  }
  return cached;
}
