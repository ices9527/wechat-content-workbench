import "dotenv/config";

import type Database from "better-sqlite3";

import { createSqliteConnection } from "./client";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS article_projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'topic_created',
    topic_type TEXT,
    target_reader TEXT,
    core_problem TEXT,
    hot_anchor TEXT,
    selected_angle_id TEXT,
    final_draft_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS angle_candidates (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    source TEXT NOT NULL,
    created_by TEXT NOT NULL,
    angle_title TEXT NOT NULL,
    reader_pain TEXT,
    promise TEXT,
    risk TEXT,
    recommended INTEGER NOT NULL DEFAULT 0,
    selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outline_versions (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    version_no INTEGER NOT NULL,
    source_invocation_id TEXT,
    mainline TEXT NOT NULL,
    outline_markdown TEXT NOT NULL,
    created_by TEXT NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS draft_versions (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    version_no INTEGER NOT NULL,
    draft_type TEXT NOT NULL,
    markdown TEXT NOT NULL,
    html TEXT,
    source_outline_id TEXT,
    source_diagnosis_id TEXT,
    source_invocation_id TEXT,
    is_final INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS content_diagnoses (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    draft_version_id TEXT NOT NULL REFERENCES draft_versions(id),
    diagnosis_markdown TEXT NOT NULL,
    text_cleanliness TEXT,
    title_cover TEXT,
    expression_efficiency TEXT,
    cognitive_gap TEXT,
    ai_trace TEXT,
    first_fix TEXT,
    source_invocation_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS topic_diagnoses (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    topic_snapshot TEXT NOT NULL,
    target_reader_snapshot TEXT,
    core_problem_snapshot TEXT,
    hot_anchor_snapshot TEXT,
    custom_instruction_snapshot TEXT,
    verdict TEXT NOT NULL,
    target_reader_check TEXT,
    reader_problem_check TEXT,
    timeliness_check TEXT,
    actionability_check TEXT,
    risk_summary TEXT,
    suggestions_markdown TEXT,
    next_action TEXT,
    source_invocation_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS topic_diagnoses_article_created_index
    ON topic_diagnoses(article_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS topic_diagnoses_source_invocation_index
    ON topic_diagnoses(source_invocation_id)`,
  `CREATE TABLE IF NOT EXISTS ai_invocations (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    article_id TEXT REFERENCES article_projects(id),
    task_type TEXT NOT NULL,
    model TEXT,
    base_url TEXT,
    prompt TEXT NOT NULL,
    response TEXT,
    custom_instruction TEXT,
    stage_prompt_label_snapshot TEXT,
    stage_prompt_snapshot TEXT,
    upstream_context_json TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stage_prompt_defaults (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    stage TEXT NOT NULL,
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS stage_prompt_defaults_owner_stage_unique
    ON stage_prompt_defaults(owner_id, stage)`,
  `CREATE TABLE IF NOT EXISTS requirement_presets (
    id TEXT PRIMARY KEY,
    stable_key TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    stage TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    prompt_fragment TEXT NOT NULL,
    default_enabled INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 100,
    source TEXT NOT NULL DEFAULT 'seed',
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS requirement_presets_owner_stable_key_unique
    ON requirement_presets(owner_id, stable_key)`,
  `CREATE INDEX IF NOT EXISTS requirement_presets_stage_index
    ON requirement_presets(stage)`,
  `CREATE TABLE IF NOT EXISTS ai_invocation_requirements (
    id TEXT PRIMARY KEY,
    ai_invocation_id TEXT NOT NULL REFERENCES ai_invocations(id),
    requirement_preset_id TEXT NOT NULL REFERENCES requirement_presets(id),
    stable_key_snapshot TEXT NOT NULL,
    label_snapshot TEXT NOT NULL,
    prompt_fragment_snapshot TEXT NOT NULL,
    stage_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ai_invocation_requirements_invocation_index
    ON ai_invocation_requirements(ai_invocation_id)`,
  `CREATE TABLE IF NOT EXISTS article_assets (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    draft_version_id TEXT,
    asset_type TEXT NOT NULL,
    variant TEXT,
    path TEXT NOT NULL,
    mime_type TEXT,
    source TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wechat_draft_uploads (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    draft_version_id TEXT NOT NULL,
    cover_asset_id TEXT,
    html_asset_id TEXT,
    wechat_media_id TEXT,
    wechat_article_url TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    uploaded_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS review_snapshots (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    snapshot_at TEXT NOT NULL,
    hours_after_publish INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    recommendations INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    notified INTEGER NOT NULL DEFAULT 0,
    primary_attribution TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_run_artifacts (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    stage TEXT NOT NULL,
    source_draft_version_id TEXT,
    source_invocation_id TEXT,
    summary_markdown TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS prompt_run_artifacts_article_stage_index
    ON prompt_run_artifacts(article_id, stage)`,
  `CREATE INDEX IF NOT EXISTS prompt_run_artifacts_invocation_index
    ON prompt_run_artifacts(source_invocation_id)`,
  `CREATE TABLE IF NOT EXISTS workflow_events (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES article_projects(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
];

const columnMigrations = [
  { table: "outline_versions", column: "source_invocation_id", definition: "TEXT" },
  { table: "draft_versions", column: "source_invocation_id", definition: "TEXT" },
  { table: "ai_invocations", column: "custom_instruction", definition: "TEXT" },
  { table: "ai_invocations", column: "stage_prompt_label_snapshot", definition: "TEXT" },
  { table: "ai_invocations", column: "stage_prompt_snapshot", definition: "TEXT" },
  { table: "ai_invocations", column: "upstream_context_json", definition: "TEXT" },
  { table: "content_diagnoses", column: "source_invocation_id", definition: "TEXT" },
  { table: "topic_diagnoses", column: "topic_snapshot", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "topic_diagnoses", column: "target_reader_snapshot", definition: "TEXT" },
  { table: "topic_diagnoses", column: "core_problem_snapshot", definition: "TEXT" },
  { table: "topic_diagnoses", column: "hot_anchor_snapshot", definition: "TEXT" },
  { table: "topic_diagnoses", column: "custom_instruction_snapshot", definition: "TEXT" }
] as const;

const postColumnStatements = [
  `CREATE INDEX IF NOT EXISTS content_diagnoses_source_invocation_index
    ON content_diagnoses(source_invocation_id)`
];

function columnExists(sqlite: Database.Database, table: string, column: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((existing) => existing.name === column);
}

export function migrateDatabase(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    for (const statement of statements) {
      sqlite.exec(statement);
    }
    for (const migration of columnMigrations) {
      if (!columnExists(sqlite, migration.table, migration.column)) {
        sqlite.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`);
      }
    }
    for (const statement of postColumnStatements) {
      sqlite.exec(statement);
    }
  })();
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  const sqlite = createSqliteConnection();
  migrateDatabase(sqlite);
  sqlite.close();
  console.log("Database migrated.");
}
