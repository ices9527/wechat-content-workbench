import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const articleProjects = sqliteTable("article_projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  status: text("status").notNull().default("topic_created"),
  topicType: text("topic_type"),
  targetReader: text("target_reader"),
  coreProblem: text("core_problem"),
  hotAnchor: text("hot_anchor"),
  selectedAngleId: text("selected_angle_id"),
  finalDraftVersionId: text("final_draft_version_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const angleCandidates = sqliteTable("angle_candidates", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  source: text("source").notNull(),
  createdBy: text("created_by").notNull(),
  angleTitle: text("angle_title").notNull(),
  readerPain: text("reader_pain"),
  promise: text("promise"),
  risk: text("risk"),
  recommended: integer("recommended", { mode: "boolean" }).notNull().default(false),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const outlineVersions = sqliteTable("outline_versions", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  versionNo: integer("version_no").notNull(),
  sourceInvocationId: text("source_invocation_id"),
  sourceResearchVersionId: text("source_research_version_id"),
  mainline: text("mainline").notNull(),
  outlineMarkdown: text("outline_markdown").notNull(),
  createdBy: text("created_by").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const researchVersions = sqliteTable("research_versions", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  versionNo: integer("version_no").notNull(),
  sourceAngleId: text("source_angle_id"),
  sourceInvocationId: text("source_invocation_id"),
  summaryMarkdown: text("summary_markdown").notNull(),
  researchMarkdown: text("research_markdown").notNull(),
  factsMarkdown: text("facts_markdown"),
  backgroundMarkdown: text("background_markdown"),
  readerQuestionsMarkdown: text("reader_questions_markdown"),
  boundariesMarkdown: text("boundaries_markdown"),
  writeableDirectionsMarkdown: text("writeable_directions_markdown"),
  avoidDirectionsMarkdown: text("avoid_directions_markdown"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const draftVersions = sqliteTable("draft_versions", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  versionNo: integer("version_no").notNull(),
  draftType: text("draft_type").notNull(),
  markdown: text("markdown").notNull(),
  html: text("html"),
  sourceOutlineId: text("source_outline_id"),
  sourceDiagnosisId: text("source_diagnosis_id"),
  sourceInvocationId: text("source_invocation_id"),
  isFinal: integer("is_final", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const contentDiagnoses = sqliteTable("content_diagnoses", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  draftVersionId: text("draft_version_id").notNull().references(() => draftVersions.id),
  diagnosisMarkdown: text("diagnosis_markdown").notNull(),
  textCleanliness: text("text_cleanliness"),
  titleCover: text("title_cover"),
  expressionEfficiency: text("expression_efficiency"),
  cognitiveGap: text("cognitive_gap"),
  aiTrace: text("ai_trace"),
  firstFix: text("first_fix"),
  sourceInvocationId: text("source_invocation_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const aiStyleChecks = sqliteTable("ai_style_checks", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  draftVersionId: text("draft_version_id").notNull().references(() => draftVersions.id),
  sourceInvocationId: text("source_invocation_id"),
  sourceType: text("source_type").notNull().default("draft_version"),
  cleanlinessVerdict: text("cleanliness_verdict").notNull(),
  score: integer("score"),
  issueCount: integer("issue_count").notNull().default(0),
  summaryMarkdown: text("summary_markdown").notNull(),
  issuesJson: text("issues_json").notNull().default("[]"),
  customInstructionSnapshot: text("custom_instruction_snapshot"),
  createdBy: text("created_by").notNull().default("ai"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const topicDiagnoses = sqliteTable("topic_diagnoses", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  topicSnapshot: text("topic_snapshot").notNull(),
  targetReaderSnapshot: text("target_reader_snapshot"),
  coreProblemSnapshot: text("core_problem_snapshot"),
  hotAnchorSnapshot: text("hot_anchor_snapshot"),
  customInstructionSnapshot: text("custom_instruction_snapshot"),
  verdict: text("verdict").notNull(),
  targetReaderCheck: text("target_reader_check"),
  readerProblemCheck: text("reader_problem_check"),
  timelinessCheck: text("timeliness_check"),
  actionabilityCheck: text("actionability_check"),
  riskSummary: text("risk_summary"),
  suggestionsMarkdown: text("suggestions_markdown"),
  nextAction: text("next_action"),
  sourceInvocationId: text("source_invocation_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const aiInvocations = sqliteTable("ai_invocations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  articleId: text("article_id").references(() => articleProjects.id),
  taskType: text("task_type").notNull(),
  model: text("model"),
  baseUrl: text("base_url"),
  prompt: text("prompt").notNull(),
  response: text("response"),
  customInstruction: text("custom_instruction"),
  stagePromptLabelSnapshot: text("stage_prompt_label_snapshot"),
  stagePromptSnapshot: text("stage_prompt_snapshot"),
  upstreamContextJson: text("upstream_context_json"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const stagePromptDefaults = sqliteTable(
  "stage_prompt_defaults",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    stage: text("stage").notNull(),
    label: text("label").notNull(),
    prompt: text("prompt").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    ownerStageUnique: uniqueIndex("stage_prompt_defaults_owner_stage_unique").on(table.ownerId, table.stage)
  })
);

export const requirementPresets = sqliteTable(
  "requirement_presets",
  {
    id: text("id").primaryKey(),
    stableKey: text("stable_key").notNull(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    stage: text("stage").notNull(),
    category: text("category").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    promptFragment: text("prompt_fragment").notNull(),
    defaultEnabled: integer("default_enabled", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull().default(100),
    source: text("source").notNull().default("seed"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    ownerStableKeyUnique: uniqueIndex("requirement_presets_owner_stable_key_unique").on(table.ownerId, table.stableKey)
  })
);

export const aiInvocationRequirements = sqliteTable("ai_invocation_requirements", {
  id: text("id").primaryKey(),
  aiInvocationId: text("ai_invocation_id").notNull().references(() => aiInvocations.id),
  requirementPresetId: text("requirement_preset_id").notNull().references(() => requirementPresets.id),
  stableKeySnapshot: text("stable_key_snapshot").notNull(),
  labelSnapshot: text("label_snapshot").notNull(),
  promptFragmentSnapshot: text("prompt_fragment_snapshot").notNull(),
  stageSnapshot: text("stage_snapshot").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const articleAssets = sqliteTable("article_assets", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  draftVersionId: text("draft_version_id"),
  assetType: text("asset_type").notNull(),
  variant: text("variant"),
  path: text("path").notNull(),
  mimeType: text("mime_type"),
  source: text("source"),
  width: integer("width"),
  height: integer("height"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const wechatDraftUploads = sqliteTable("wechat_draft_uploads", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  draftVersionId: text("draft_version_id").notNull(),
  coverAssetId: text("cover_asset_id"),
  htmlAssetId: text("html_asset_id"),
  wechatMediaId: text("wechat_media_id"),
  wechatArticleUrl: text("wechat_article_url"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  uploadedAt: text("uploaded_at")
});

export const reviewSnapshots = sqliteTable("review_snapshots", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  snapshotAt: text("snapshot_at").notNull(),
  hoursAfterPublish: integer("hours_after_publish").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  recommendations: integer("recommendations").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
  primaryAttribution: text("primary_attribution"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const promptRunArtifacts = sqliteTable("prompt_run_artifacts", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  stage: text("stage").notNull(),
  sourceDraftVersionId: text("source_draft_version_id"),
  sourceInvocationId: text("source_invocation_id"),
  summaryMarkdown: text("summary_markdown").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const workflowEvents = sqliteTable("workflow_events", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull().references(() => articleProjects.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  eventType: text("event_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export type ArticleProject = typeof articleProjects.$inferSelect;
export type NewArticleProject = typeof articleProjects.$inferInsert;
export type AngleCandidate = typeof angleCandidates.$inferSelect;
export type OutlineVersion = typeof outlineVersions.$inferSelect;
export type ResearchVersion = typeof researchVersions.$inferSelect;
export type DraftVersion = typeof draftVersions.$inferSelect;
export type ContentDiagnosis = typeof contentDiagnoses.$inferSelect;
export type AIStyleCheck = typeof aiStyleChecks.$inferSelect;
export type TopicDiagnosis = typeof topicDiagnoses.$inferSelect;
export type AIInvocation = typeof aiInvocations.$inferSelect;
export type StagePromptDefault = typeof stagePromptDefaults.$inferSelect;
export type RequirementPreset = typeof requirementPresets.$inferSelect;
export type AIInvocationRequirement = typeof aiInvocationRequirements.$inferSelect;
export type ArticleAsset = typeof articleAssets.$inferSelect;
export type WechatDraftUpload = typeof wechatDraftUploads.$inferSelect;
export type PromptRunArtifact = typeof promptRunArtifacts.$inferSelect;
