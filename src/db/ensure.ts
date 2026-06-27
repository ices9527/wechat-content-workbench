import { getDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

let ensured = false;

export function ensureDatabaseReady(): void {
  if (ensured) {
    return;
  }
  const { sqlite, db } = getDatabase();
  migrateDatabase(sqlite);
  seedDatabase(db);
  ensured = true;
}
