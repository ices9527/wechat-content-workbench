import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { assertCanTransition, getNextAction, getStatusLabel, isPublishQueueStatus, type ArticleStatus } from "@/domain/status";
import { requirementStageSchema, stagePromptStageSchema, type RequirementStage, type StagePromptStage } from "@/domain/stages";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { ensureDatabaseReady } from "@/db/ensure";
import { LOCAL_USER_ID } from "@/db/seed";
import {
  aiInvocations,
  aiInvocationRequirements,
  aiStyleChecks,
  angleCandidates,
  articleAssets,
  articleProjects,
  contentDiagnoses,
  draftVersions,
  outlineVersions,
  promptRunArtifacts,
  researchVersions,
  topicDiagnoses,
  topicVersions,
  wechatDraftUploads,
  workflowEvents,
  type AngleCandidate,
  type ArticleProject,
  type ContentDiagnosis,
  type DraftVersion,
  type OutlineVersion,
  type PromptRunArtifact,
  type ResearchVersion,
  type RequirementPreset,
  type AIInvocationRequirement,
  type AIStyleCheck,
  type StagePromptDefault,
  type TopicDiagnosis,
  type TopicVersion
} from "@/db/schema";

import type { AIClient, GeneratedAngle, GeneratedContentResearch, GeneratedTopicDiagnosis, TopicDiagnosisVerdict } from "./ai";
import { getAIClient } from "./ai";
import { requireArticle, requireDiagnosis, requireDraft, requireOutline, requireResearchVersion } from "./article-records";
import { htmlToPlainText } from "./html-text";
import { findRequirementSnapshotsForDraft } from "./prompt-recipes";
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from "./prompt-limits";
import { buildLayeredPrompt, renderPrompt } from "./prompts";
import { buildPromptWithQualityGate } from "./quality-gate-prompts";
import { resolveSelectedRequirements } from "./requirements";
import { getStagePromptDefault } from "./stage-prompts";
import {
  assertTopicDiagnosisContextAllowsDownstreamFlow,
  formatTopicDiagnosisContextForPrompt,
  getLatestTopicDiagnosisContext,
  toUpstreamContextSnapshot,
  type UpstreamContextSnapshot
} from "./topic-diagnosis-context";

export { requirementStageSchema, stagePromptStageSchema };
export {
  createRequirementInputSchema,
  createRequirementPreset,
  deleteRequirementPreset,
  listRequirementPresets,
  requirementTypeSchema,
  resolveSelectedRequirements,
  updateRequirementInputSchema,
  updateRequirementPreset
} from "./requirements";
export { getStagePromptDefault, listStagePromptDefaults, updateStagePromptDefault, updateStagePromptInputSchema } from "./stage-prompts";
export {
  getPromptRecipeForAIStyleCheck,
  getPromptRecipeForDraft,
  getPromptRecipeForIllustrationPlan,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  getPromptRecipeForResearch,
  getPromptRecipeForTopicDiagnosis
} from "./prompt-recipes";
export {
  confirmIllustrationPlan,
  confirmIllustrationPlanInputSchema,
  generateIllustrationPlan,
  generateIllustrationPlanInputSchema,
  listIllustrationPlans,
  parseIllustrationPlanPayload,
  requireIllustrationPlan,
  updateIllustrationPlan,
  updateIllustrationPlanInputSchema,
  type ConfirmIllustrationPlanInput,
  type GenerateIllustrationPlanInput,
  type IllustrationPlanItem,
  type IllustrationPlanPayload,
  type UpdateIllustrationPlanInput
} from "./illustration-plans";
export {
  createInlineIllustrationClient,
  FakeInlineIllustrationClient,
  generateInlineIllustration,
  generateInlineIllustrationInputSchema,
  isPlaceholderInlineIllustrationAsset,
  MockRealInlineIllustrationClient,
  MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER,
  requireArticleAssetFile,
  requireInlineIllustrationAssetFile,
  type ArticleAssetFile,
  type GenerateInlineIllustrationInput,
  type InlineIllustrationAssetFile,
  type InlineIllustrationClient,
  type InlineIllustrationClientInput,
  type InlineIllustrationClientResult
} from "./inline-illustrations";
export {
  buildRealInlineIllustrationPrompt,
  type RealInlineIllustrationPromptInput
} from "./inline-illustration-prompts";
export {
  OpenAIImageInlineIllustrationClient,
  OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER,
  openAIImageInlineIllustrationClientFromEnv,
  type OpenAIImageInlineIllustrationClientConfig
} from "./inline-illustration-image-provider";
export { getLatestTopicDiagnosisContext, isTopicDiagnosisStaleForArticle } from "./topic-diagnosis-context";
export { CUSTOM_INSTRUCTION_MAX_LENGTH, REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH } from "./prompt-limits";
export type { CreateRequirementInput, UpdateRequirementInput } from "./requirements";
export type { PromptRecipe, PromptRecipeRequirement } from "./prompt-recipes";
export type { TopicDiagnosisContext } from "./topic-diagnosis-context";
export type { UpdateStagePromptInput } from "./stage-prompts";
export type { RequirementStage, StagePromptStage };

// Schemas and public types

export const createArticleInputSchema = z.object({
  topic: z.string().trim().min(1, "主题不能为空"),
  targetReader: z.string().trim().optional(),
  coreProblem: z.string().trim().optional(),
  hotAnchor: z.string().trim().optional()
});

export type CreateArticleInput = z.infer<typeof createArticleInputSchema>;

export const updateArticleInputSchema = z.object({
  topic: z.string().trim().min(1, "主题不能为空").optional(),
  targetReader: z.string().trim().optional(),
  coreProblem: z.string().trim().optional(),
  hotAnchor: z.string().trim().optional()
});

export type UpdateArticleInput = z.infer<typeof updateArticleInputSchema>;

export type ArticleListItem = ArticleProject & {
  statusLabel: string;
  nextAction: string;
  latestTopicDiagnosis: ArticleListTopicDiagnosis | null;
};

export type ArticleListTopicDiagnosis = Pick<TopicDiagnosis, "id" | "verdict" | "riskSummary" | "createdAt"> & {
  verdictLabel: string;
};

export const TOPIC_DIAGNOSIS_FILTER_VALUES = ["missing", "pass", "revise", "hold", "drop"] as const;
export type TopicDiagnosisFilter = (typeof TOPIC_DIAGNOSIS_FILTER_VALUES)[number];

export const TOPIC_DIAGNOSIS_FILTER_LABELS: Record<TopicDiagnosisFilter, string> = {
  missing: "未诊断",
  pass: "通过",
  revise: "修改后通过",
  hold: "暂缓",
  drop: "放弃"
};

export type ArticleListFilters = {
  status?: ArticleStatus;
  publishQueueOnly?: boolean;
  topicDiagnosis?: TopicDiagnosisFilter;
  query?: string;
};

export const manualAngleInputSchema = z.object({
  angleTitle: z.string().trim().min(1, "角度标题不能为空"),
  readerPain: z.string().trim().optional(),
  promise: z.string().trim().optional(),
  risk: z.string().trim().optional()
});

export const saveDraftInputSchema = z.object({
  markdown: z.string().trim().min(1, "文案不能为空")
});

export const updateDraftInputSchema = saveDraftInputSchema.extend({
  draftVersionId: z.string().trim().min(1, "必须指定文案版本")
});

export const saveOutlineInputSchema = z.object({
  mainline: z.string().trim().min(1, "主线不能为空"),
  outlineMarkdown: z.string().trim().min(1, "提纲不能为空")
});

export const updateOutlineInputSchema = saveOutlineInputSchema.extend({
  outlineVersionId: z.string().trim().min(1, "必须指定提纲版本")
});

const promptControlInputShape = {
  customInstruction: z
    .string()
    .trim()
    .max(CUSTOM_INSTRUCTION_MAX_LENGTH, `本次提示词不能超过 ${CUSTOM_INSTRUCTION_MAX_LENGTH} 字`)
    .optional()
    .transform((value) => value || undefined),
  selectedRequirementIds: z.array(z.string().trim().min(1, "可选提示词 ID 不能为空")).optional().default([])
};

export const generateWithPromptInputSchema = z.object(promptControlInputShape);
export const generateContentResearchInputSchema = z.object(promptControlInputShape);
export const saveManualResearchInputSchema = z.object({
  sourceResearchVersionId: z.string().trim().min(1, "必须指定研究资料包版本"),
  summaryMarkdown: z.string().trim().min(1, "材料摘要不能为空"),
  researchMarkdown: z.string().trim().min(1, "研究资料包不能为空")
});
export const generateOutlineInputSchema = z.object({
  ...promptControlInputShape,
  researchVersionId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
});
export const topicDiagnosisInputSchema = z.object(promptControlInputShape);

export const runDbsContentInputSchema = z.object({
  draftVersionId: z.string().trim().min(1, "必须指定文案版本"),
  ...promptControlInputShape
});

export const runAIStyleCheckInputSchema = z.object({
  draftVersionId: z.string().trim().min(1, "必须指定文案版本"),
  ...promptControlInputShape
});

export const reviseFromAIStyleCheckInputSchema = z.object({
  checkId: z.string().trim().min(1, "必须指定文案清洁检查记录")
});

export const runPublishHTMLAIStyleCheckInputSchema = z.object({
  htmlAssetId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  ...promptControlInputShape
});

export const prePublishCheckInputSchema = z.object(promptControlInputShape);

export const reviewCheckInputSchema = z.object(promptControlInputShape);

export const reviseFromDiagnosisInputSchema = z.object({
  diagnosisId: z.string().trim().min(1, "必须指定诊断记录")
});

export const markFinalDraftInputSchema = z.object({
  draftVersionId: z.string().trim().min(1, "必须指定最终稿版本"),
  force: z.boolean().optional().default(false)
});

export type ManualAngleInput = z.infer<typeof manualAngleInputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftInputSchema>;
export type SaveOutlineInput = z.infer<typeof saveOutlineInputSchema>;
export type UpdateOutlineInput = z.infer<typeof updateOutlineInputSchema>;
export type GenerateWithPromptInput = z.input<typeof generateWithPromptInputSchema>;
export type GenerateContentResearchInput = z.input<typeof generateContentResearchInputSchema>;
export type SaveManualResearchInput = z.input<typeof saveManualResearchInputSchema>;
export type GenerateOutlineInput = z.input<typeof generateOutlineInputSchema>;
export type TopicDiagnosisInput = z.input<typeof topicDiagnosisInputSchema>;
export type RunDbsContentInput = z.input<typeof runDbsContentInputSchema>;
export type RunAIStyleCheckInput = z.input<typeof runAIStyleCheckInputSchema>;
export type ReviseFromAIStyleCheckInput = z.infer<typeof reviseFromAIStyleCheckInputSchema>;
export type RunPublishHTMLAIStyleCheckInput = z.input<typeof runPublishHTMLAIStyleCheckInputSchema>;
export type PrePublishCheckInput = z.input<typeof prePublishCheckInputSchema>;
export type ReviewCheckInput = z.input<typeof reviewCheckInputSchema>;
export type ReviseFromDiagnosisInput = z.infer<typeof reviseFromDiagnosisInputSchema>;
export type MarkFinalDraftInput = z.input<typeof markFinalDraftInputSchema>;

// Read model helpers

function titleFromTopic(topic: string): string {
  return topic.length > 48 ? `${topic.slice(0, 48)}...` : topic;
}

function formatTopicDiagnosisVerdict(verdict: string): string {
  return TOPIC_DIAGNOSIS_FILTER_LABELS[verdict as TopicDiagnosisVerdict] || verdict;
}

function toListItem(article: ArticleProject, latestTopicDiagnosis: TopicDiagnosis | null = null): ArticleListItem {
  const status = article.status as ArticleStatus;
  return {
    ...article,
    statusLabel: getStatusLabel(status),
    nextAction: getNextAction(status),
    latestTopicDiagnosis: latestTopicDiagnosis
      ? {
          id: latestTopicDiagnosis.id,
          verdict: latestTopicDiagnosis.verdict,
          verdictLabel: formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict),
          riskSummary: latestTopicDiagnosis.riskSummary,
          createdAt: latestTopicDiagnosis.createdAt
        }
      : null
  };
}

function normalizeArticleSearchQuery(query: string | undefined): string {
  return (query || "").trim().toLowerCase();
}

function matchesArticleSearchQuery(article: ArticleListItem, query: string): boolean {
  if (!query) {
    return true;
  }
  return [article.topic, article.targetReader, article.coreProblem, article.hotAnchor].some((value) =>
    (value || "").toLowerCase().includes(query)
  );
}

function matchesTopicDiagnosisFilter(article: ArticleListItem, filter: TopicDiagnosisFilter | undefined): boolean {
  if (!filter) {
    return true;
  }
  if (filter === "missing") {
    return article.latestTopicDiagnosis === null;
  }
  return article.latestTopicDiagnosis?.verdict === filter;
}

function getLatestTopicDiagnosesForArticles(articleIds: string[], db: WorkbenchDatabase): Map<string, TopicDiagnosis> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const diagnoses = db
    .select()
    .from(topicDiagnoses)
    .where(inArray(topicDiagnoses.articleId, articleIds))
    .orderBy(desc(topicDiagnoses.createdAt))
    .all();

  const latestByArticleId = new Map<string, TopicDiagnosis>();
  for (const diagnosis of diagnoses) {
    if (!latestByArticleId.has(diagnosis.articleId)) {
      latestByArticleId.set(diagnosis.articleId, diagnosis);
    }
  }
  return latestByArticleId;
}

// Workflow guards and event recording

function recordWorkflowEvent(
  db: WorkbenchDatabase,
  article: ArticleProject,
  fromStatus: ArticleStatus | null,
  toStatus: ArticleStatus,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  db.insert(workflowEvents)
    .values({
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      eventType,
      fromStatus,
      toStatus,
      payloadJson: JSON.stringify(payload)
    })
    .run();
}

function transitionArticle(
  db: WorkbenchDatabase,
  article: ArticleProject,
  toStatus: ArticleStatus,
  eventType: string,
  payload: Record<string, unknown> = {}
): ArticleProject {
  const fromStatus = article.status as ArticleStatus;
  if (fromStatus === toStatus) {
    return article;
  }
  assertCanTransition(fromStatus, toStatus);
  const updatedAt = new Date().toISOString();
  db.update(articleProjects).set({ status: toStatus, updatedAt }).where(eq(articleProjects.id, article.id)).run();
  recordWorkflowEvent(db, article, fromStatus, toStatus, eventType, payload);
  return { ...article, status: toStatus, updatedAt };
}

// AI invocation snapshots

function recordAIInvocation(
  db: WorkbenchDatabase,
  input: {
    article: ArticleProject;
    taskType: string;
    client: Pick<AIClient, "model" | "baseUrl">;
    prompt: string;
    response?: unknown;
    customInstruction?: string | null;
    stagePrompt?: Pick<StagePromptDefault, "label" | "prompt" | "enabled"> | null;
    upstreamContext?: UpstreamContextSnapshot | null;
    status: "success" | "failed";
    errorMessage?: string;
  }
): string {
  const id = randomUUID();
  db.insert(aiInvocations)
    .values({
      id,
      ownerId: input.article.ownerId,
      articleId: input.article.id,
      taskType: input.taskType,
      model: input.client.model,
      baseUrl: input.client.baseUrl,
      prompt: input.prompt,
      response: input.response ? JSON.stringify(input.response) : null,
      customInstruction: input.customInstruction || null,
      stagePromptLabelSnapshot: input.stagePrompt?.enabled ? input.stagePrompt.label : null,
      stagePromptSnapshot: input.stagePrompt?.enabled ? input.stagePrompt.prompt : null,
      upstreamContextJson: input.upstreamContext ? JSON.stringify(input.upstreamContext) : null,
      status: input.status,
      errorMessage: input.errorMessage || null
    })
    .run();
  return id;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function recordFailedAIInvocation(
  db: WorkbenchDatabase,
  input: {
    article: ArticleProject;
    taskType: string;
    client: Pick<AIClient, "model" | "baseUrl">;
    prompt: string;
    customInstruction?: string | null;
    stagePrompt?: Pick<StagePromptDefault, "label" | "prompt" | "enabled"> | null;
    upstreamContext?: UpstreamContextSnapshot | null;
    error: unknown;
    fallbackMessage: string;
  }
): string {
  return recordAIInvocation(db, {
    article: input.article,
    taskType: input.taskType,
    client: input.client,
    prompt: input.prompt,
    customInstruction: input.customInstruction,
    stagePrompt: input.stagePrompt,
    upstreamContext: input.upstreamContext,
    status: "failed",
    errorMessage: getErrorMessage(input.error, input.fallbackMessage)
  });
}

function recordAIInvocationRequirements(
  db: WorkbenchDatabase,
  aiInvocationId: string,
  requirements: RequirementPreset[]
): void {
  if (requirements.length === 0) {
    return;
  }

  db.insert(aiInvocationRequirements)
    .values(
      requirements.map((requirement) => ({
        id: randomUUID(),
        aiInvocationId,
        requirementPresetId: requirement.id,
        stableKeySnapshot: requirement.stableKey,
        labelSnapshot: requirement.label,
        promptFragmentSnapshot: requirement.promptFragment,
        stageSnapshot: requirement.stage
      }))
    )
    .run();
}

function nextVersionNo(rows: Array<{ versionNo: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1;
}

function buildSelectedRequirementSummaryMarkdown(title: string, requirements: RequirementPreset[]): string {
  if (requirements.length === 0) {
    return "";
  }
  return ["", `## ${title}`, ...requirements.map((requirement) => `- ${requirement.label}：${requirement.promptFragment}`)].join("\n");
}

function buildResearchMarkdown(generated: GeneratedContentResearch): string {
  return [
    ["## 核心事实", generated.factsMarkdown],
    ["## 关键背景", generated.backgroundMarkdown],
    ["## 读者真实问题", generated.readerQuestionsMarkdown],
    ["## 边界提醒", generated.boundariesMarkdown],
    ["## 可写方向", generated.writeableDirectionsMarkdown],
    ["## 不建议写的方向", generated.avoidDirectionsMarkdown],
    ["## 给主线提纲的材料摘要", generated.summaryMarkdown]
  ]
    .map(([title, content]) => (content.trim() ? `${title}\n${content.trim()}` : ""))
    .filter(Boolean)
    .join("\n\n");
}

function formatResearchForOutlinePrompt(research: ResearchVersion | null): string {
  if (!research) {
    return "";
  }
  return [
    "## 内容研究资料包摘要",
    research.summaryMarkdown,
    research.boundariesMarkdown ? "\n## 资料包边界提醒" : "",
    research.boundariesMarkdown || "",
    research.writeableDirectionsMarkdown ? "\n## 资料包可写方向" : "",
    research.writeableDirectionsMarkdown || "",
    research.avoidDirectionsMarkdown ? "\n## 资料包不建议写的方向" : "",
    research.avoidDirectionsMarkdown || ""
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

// Shared command helpers

function requireFinalDraft(article: ArticleProject, db: WorkbenchDatabase): DraftVersion {
  if (article.finalDraftVersionId) {
    const draft = requireDraft(article.id, article.finalDraftVersionId, db);
    if (draft.isFinal) {
      return draft;
    }
  }

  const draft = db
    .select()
    .from(draftVersions)
    .where(and(eq(draftVersions.articleId, article.id), eq(draftVersions.isFinal, true)))
    .orderBy(desc(draftVersions.createdAt))
    .get();
  if (!draft) {
    throw new Error("请先标记最终稿");
  }
  return draft;
}

function requireAIStyleCheck(articleId: string, checkId: string, db: WorkbenchDatabase): AIStyleCheck {
  const check = db
    .select()
    .from(aiStyleChecks)
    .where(and(eq(aiStyleChecks.id, checkId), eq(aiStyleChecks.articleId, articleId)))
    .get();
  if (!check) {
    throw new Error("文案清洁检查记录不存在");
  }
  return check;
}

function getLatestDraftVersionAIStyleCheck(articleId: string, draftVersionId: string, db: WorkbenchDatabase): AIStyleCheck | null {
  return (
    db
      .select()
      .from(aiStyleChecks)
      .where(
        and(
          eq(aiStyleChecks.articleId, articleId),
          eq(aiStyleChecks.draftVersionId, draftVersionId),
          eq(aiStyleChecks.sourceType, "draft_version")
        )
      )
      .orderBy(desc(aiStyleChecks.createdAt))
      .get() || null
  );
}

function requireHTMLAsset(articleId: string, draftVersionId: string, htmlAssetId: string | undefined, db: WorkbenchDatabase) {
  const conditions = [
    eq(articleAssets.articleId, articleId),
    eq(articleAssets.draftVersionId, draftVersionId),
    eq(articleAssets.assetType, "html")
  ];
  if (htmlAssetId) {
    conditions.push(eq(articleAssets.id, htmlAssetId));
  }
  const asset = db.select().from(articleAssets).where(and(...conditions)).orderBy(desc(articleAssets.createdAt)).get();
  if (!asset) {
    throw new Error("请先生成公众号 HTML");
  }
  return asset;
}

function isFinalDraftLockedStatus(status: ArticleStatus): boolean {
  return isPublishQueueStatus(status) || status === "review_recorded";
}

function getPublishContext(articleId: string, db: WorkbenchDatabase): {
  htmlAssetCount: number;
  coverAssetCount: number;
  uploadStatus: string;
} {
  const assets = db.select().from(articleAssets).where(eq(articleAssets.articleId, articleId)).all();
  const latestUpload = db
    .select()
    .from(wechatDraftUploads)
    .where(eq(wechatDraftUploads.articleId, articleId))
    .orderBy(desc(wechatDraftUploads.uploadedAt))
    .get();

  const htmlAssetCount = assets.filter((asset) => asset.assetType === "html").length;
  const coverAssetCount = assets.filter((asset) => asset.assetType === "cover").length;
  const uploadStatus = latestUpload
    ? latestUpload.status === "success"
      ? `已上传草稿箱：${latestUpload.wechatMediaId || "无 media_id"}`
      : `草稿箱状态：${latestUpload.status}${latestUpload.errorMessage ? `，${latestUpload.errorMessage}` : ""}`
    : "未上传草稿箱";

  return { htmlAssetCount, coverAssetCount, uploadStatus };
}

function formatAIStyleCheckIssuesForPrompt(check: AIStyleCheck): string {
  let issues: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(check.issuesJson) as unknown;
    if (Array.isArray(parsed)) {
      issues = parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  } catch {
    issues = [];
  }
  if (issues.length === 0) {
    return "无具体问题列表。";
  }
  return issues
    .map((issue, index) =>
      [
        `${index + 1}. ${String(issue.type || "未分类")} / ${String(issue.severity || "medium")}`,
        issue.quote ? `原文片段：${String(issue.quote)}` : "",
        issue.problem ? `问题：${String(issue.problem)}` : "",
        issue.fixDirection || issue.fix_direction ? `修改方向：${String(issue.fixDirection || issue.fix_direction)}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

// Article read models and queries

function createTopicVersionRecord(
  article: Pick<ArticleProject, "id" | "ownerId" | "topic" | "targetReader" | "coreProblem" | "hotAnchor">,
  versionNo: number,
  createdBy: "initial" | "user_edit",
  createdAt: string
): TopicVersion {
  return {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    versionNo,
    topic: article.topic,
    targetReader: article.targetReader,
    coreProblem: article.coreProblem,
    hotAnchor: article.hotAnchor,
    createdBy,
    createdAt
  };
}

function latestTopicVersionNo(articleId: string, db: WorkbenchDatabase): number {
  return (
    db
      .select()
      .from(topicVersions)
      .where(eq(topicVersions.articleId, articleId))
      .orderBy(desc(topicVersions.versionNo))
      .get()?.versionNo || 0
  );
}

export function createArticle(input: CreateArticleInput, db: WorkbenchDatabase = getDatabase().db): ArticleProject {
  const parsed = createArticleInputSchema.parse(input);
  const now = new Date().toISOString();
  const article: ArticleProject = {
    id: randomUUID(),
    ownerId: LOCAL_USER_ID,
    title: titleFromTopic(parsed.topic),
    topic: parsed.topic,
    status: "topic_created",
    topicType: null,
    targetReader: parsed.targetReader || null,
    coreProblem: parsed.coreProblem || null,
    hotAnchor: parsed.hotAnchor || null,
    selectedAngleId: null,
    finalDraftVersionId: null,
    createdAt: now,
    updatedAt: now
  };

  db.transaction(() => {
    db.insert(articleProjects).values(article).run();
    db.insert(topicVersions).values(createTopicVersionRecord(article, 1, "initial", now)).run();
  });
  return article;
}

export function listArticles(
  filters: ArticleListFilters = {},
  db: WorkbenchDatabase = getDatabase().db
): ArticleListItem[] {
  let rows: ArticleProject[];
  if (filters.status) {
    rows = db
      .select()
      .from(articleProjects)
      .where(eq(articleProjects.status, filters.status))
      .orderBy(desc(articleProjects.updatedAt))
      .all();
  } else if (filters.publishQueueOnly) {
    const statuses = [
      "ready_to_publish",
      "publish_package_generated",
      "cover_generated",
      "uploaded_to_draft_box",
      "published_manually",
      "review_pending"
    ];
    rows = db
      .select()
      .from(articleProjects)
      .where(inArray(articleProjects.status, statuses))
      .orderBy(desc(articleProjects.updatedAt))
      .all();
  } else {
    rows = db.select().from(articleProjects).orderBy(desc(articleProjects.updatedAt)).all();
  }
  const latestTopicDiagnoses = getLatestTopicDiagnosesForArticles(
    rows.map((article) => article.id),
    db
  );
  const query = normalizeArticleSearchQuery(filters.query);
  return rows
    .map((article) => toListItem(article, latestTopicDiagnoses.get(article.id) || null))
    .filter((article) => matchesTopicDiagnosisFilter(article, filters.topicDiagnosis))
    .filter((article) => matchesArticleSearchQuery(article, query));
}

export function getArticle(id: string, db: WorkbenchDatabase = getDatabase().db): ArticleListItem | null {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, id)).get();
  if (!article) {
    return null;
  }
  const latestTopicDiagnosis = getLatestTopicDiagnosesForArticles([article.id], db).get(article.id) || null;
  return toListItem(article, latestTopicDiagnosis);
}

export function listAngles(articleId: string, db: WorkbenchDatabase = getDatabase().db): AngleCandidate[] {
  return db
    .select()
    .from(angleCandidates)
    .where(eq(angleCandidates.articleId, articleId))
    .orderBy(desc(angleCandidates.createdAt))
    .all();
}

export function listOutlines(articleId: string, db: WorkbenchDatabase = getDatabase().db): OutlineVersion[] {
  return db
    .select()
    .from(outlineVersions)
    .where(eq(outlineVersions.articleId, articleId))
    .orderBy(desc(outlineVersions.versionNo))
    .all();
}

export function listResearchVersions(articleId: string, db: WorkbenchDatabase = getDatabase().db): ResearchVersion[] {
  return db
    .select()
    .from(researchVersions)
    .where(eq(researchVersions.articleId, articleId))
    .orderBy(desc(researchVersions.versionNo))
    .all();
}

export function listDrafts(articleId: string, db: WorkbenchDatabase = getDatabase().db): DraftVersion[] {
  return db
    .select()
    .from(draftVersions)
    .where(eq(draftVersions.articleId, articleId))
    .orderBy(desc(draftVersions.versionNo))
    .all();
}

export function listDiagnoses(articleId: string, db: WorkbenchDatabase = getDatabase().db): ContentDiagnosis[] {
  return db
    .select()
    .from(contentDiagnoses)
    .where(eq(contentDiagnoses.articleId, articleId))
    .orderBy(desc(contentDiagnoses.createdAt))
    .all();
}

export function listAIStyleChecks(articleId: string, db: WorkbenchDatabase = getDatabase().db): AIStyleCheck[] {
  return db
    .select()
    .from(aiStyleChecks)
    .where(eq(aiStyleChecks.articleId, articleId))
    .orderBy(desc(aiStyleChecks.createdAt))
    .all();
}

export function listTopicDiagnoses(articleId: string, db: WorkbenchDatabase = getDatabase().db): TopicDiagnosis[] {
  return db
    .select()
    .from(topicDiagnoses)
    .where(eq(topicDiagnoses.articleId, articleId))
    .orderBy(desc(topicDiagnoses.createdAt))
    .all();
}

export function listTopicVersions(articleId: string, db: WorkbenchDatabase = getDatabase().db): TopicVersion[] {
  return db
    .select()
    .from(topicVersions)
    .where(eq(topicVersions.articleId, articleId))
    .orderBy(desc(topicVersions.versionNo))
    .all();
}

export function listPromptRunArtifacts(
  articleId: string,
  input: { stage?: Extract<RequirementStage, "pre_publish" | "review"> } = {},
  db: WorkbenchDatabase = getDatabase().db
): PromptRunArtifact[] {
  const conditions = [eq(promptRunArtifacts.articleId, articleId)];
  if (input.stage) {
    conditions.push(eq(promptRunArtifacts.stage, input.stage));
  }
  return db.select().from(promptRunArtifacts).where(and(...conditions)).orderBy(desc(promptRunArtifacts.createdAt)).all();
}

// Requirement compliance helpers

function buildRequirementComplianceMarkdown(markdown: string, requirements: AIInvocationRequirement[]): string {
  if (requirements.length === 0) {
    return "";
  }

  const violations: string[] = [];
  const combined = requirements
    .map((requirement) => `${requirement.labelSnapshot}\n${requirement.promptFragmentSnapshot}`)
    .join("\n");

  if (/不是.{0,40}而是/.test(markdown) && /不是|而是/.test(combined)) {
    violations.push("- 违反“禁用不是而是”：文案中出现了“不是……而是……”句式。");
  }
  if (/(财富自由|暴富|躺赚|稳赚|稳赚不赔|翻倍)/.test(markdown) && /(财富|夸张|口号|收益)/.test(combined)) {
    violations.push("- 可能违反克制表达：文案中出现夸张财富词。");
  }
  if (/(保证|一定|必然|确保|100%|百分百)/.test(markdown) && /(承诺|确定结果|一定)/.test(combined)) {
    violations.push("- 可能违反“不承诺结果”：文案中出现绝对化承诺表达。");
  }
  if (/(绕开|规避|灰色|避开监管|绕过监管)/.test(markdown) && /(监管|绕开|规避)/.test(combined)) {
    violations.push("- 可能违反“不暗示绕监管”：文案中出现规避监管相关表达。");
  }

  if (violations.length === 0) {
    return ["\n\n## 要求遵守情况", "未发现已选硬性要求的明显违反。"].join("\n");
  }

  return ["\n\n## 要求遵守情况", ...violations].join("\n");
}

function hasUsefulTopicDiagnosis(generated: GeneratedTopicDiagnosis): boolean {
  return [
    generated.qualityGate.summaryForDownstream,
    generated.targetReaderCheck,
    generated.readerProblemCheck,
    generated.timelinessCheck,
    generated.actionabilityCheck,
    generated.riskSummary,
    generated.suggestionsMarkdown,
    generated.nextAction
  ].some((value) => value.trim().length > 0);
}

// Topic and angle commands

export function createManualAngle(
  articleId: string,
  input: ManualAngleInput,
  db: WorkbenchDatabase = getDatabase().db
): AngleCandidate {
  const article = requireArticle(articleId, db);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);
  const parsed = manualAngleInputSchema.parse(input);
  const angle: AngleCandidate = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    source: "manual",
    createdBy: "user",
    angleTitle: parsed.angleTitle,
    readerPain: parsed.readerPain || null,
    promise: parsed.promise || null,
    risk: parsed.risk || null,
    recommended: false,
    selected: false,
    createdAt: new Date().toISOString()
  };
  db.insert(angleCandidates).values(angle).run();
  return angle;
}

export async function runTopicDiagnosis(
  articleId: string,
  input: TopicDiagnosisInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<TopicDiagnosis> {
  const parsed = topicDiagnosisInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "topic", db);
  const prompt = buildLayeredPrompt(
    buildPromptWithQualityGate(
      renderPrompt("topic_diagnosis", {
        topic: article.topic,
        targetReader: article.targetReader,
        coreProblem: article.coreProblem,
        hotAnchor: article.hotAnchor
      }),
      "topic"
    ),
    {
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.diagnoseTopic(prompt);
    if (!hasUsefulTopicDiagnosis(generated)) {
      throw new Error("AI 返回的选题诊断为空");
    }

    const now = new Date().toISOString();
    let diagnosis: TopicDiagnosis = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      topicSnapshot: article.topic,
      targetReaderSnapshot: article.targetReader,
      coreProblemSnapshot: article.coreProblem,
      hotAnchorSnapshot: article.hotAnchor,
      customInstructionSnapshot: parsed.customInstruction || null,
      verdict: generated.qualityGate.verdict,
      targetReaderCheck: generated.targetReaderCheck || null,
      readerProblemCheck: generated.readerProblemCheck || null,
      timelinessCheck: generated.timelinessCheck || null,
      actionabilityCheck: generated.actionabilityCheck || null,
      riskSummary: generated.riskSummary || null,
      suggestionsMarkdown: generated.suggestionsMarkdown || null,
      nextAction: generated.nextAction || null,
      sourceInvocationId: null,
      createdAt: now
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "topic_diagnosis",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        status: "success"
      });
      diagnosis = { ...diagnosis, sourceInvocationId: invocationId };
      db.insert(topicDiagnoses).values(diagnosis).run();
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);

      const fromStatus = article.status as ArticleStatus;
      if (fromStatus === "topic_created") {
        transitionArticle(db, article, "topic_diagnosed", "run_topic_diagnosis", {
          topicDiagnosisId: diagnosis.id,
          verdict: diagnosis.verdict
        });
      } else {
        db.update(articleProjects).set({ updatedAt: now }).where(eq(articleProjects.id, article.id)).run();
        recordWorkflowEvent(db, article, fromStatus, fromStatus, "run_topic_diagnosis", {
          topicDiagnosisId: diagnosis.id,
          verdict: diagnosis.verdict
        });
      }
    });

    return diagnosis;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "topic_diagnosis",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      error,
      fallbackMessage: "AI 选题诊断失败"
    });
    throw error;
  }
}

export async function generateAngles(
  articleId: string,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db,
  input: GenerateWithPromptInput = {}
): Promise<AngleCandidate[]> {
  const parsed = generateWithPromptInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);
  const upstreamContext = toUpstreamContextSnapshot(topicDiagnosisContext);
  const stagePrompt = getStagePromptDefault("angle", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "angle", db);
  const prompt = buildLayeredPrompt(
    [
      renderPrompt("generate_angles", {
        topic: article.topic,
        targetReader: article.targetReader,
        coreProblem: article.coreProblem,
        hotAnchor: article.hotAnchor
      }),
      formatTopicDiagnosisContextForPrompt(topicDiagnosisContext, "angle")
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generateAngles(prompt);
    if (generated.length < 5) {
      throw new Error("AI 至少需要返回 5 个角度");
    }
    const created = generated.map((angle: GeneratedAngle, index) => ({
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      source: "ai",
      createdBy: "ai",
      angleTitle: angle.angleTitle,
      readerPain: angle.readerPain,
      promise: angle.promise,
      risk: angle.risk,
      recommended: index === 0,
      selected: false,
      createdAt: new Date().toISOString()
    }));

    db.transaction(() => {
      db.insert(angleCandidates).values(created).run();
      if (article.status === "topic_created" || article.status === "topic_diagnosed") {
        transitionArticle(db, article, "angles_generated", "generate_angles", { count: created.length });
      }
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "generate_angles",
        client,
        prompt,
        response: { angles: generated },
        customInstruction: parsed.customInstruction,
        stagePrompt,
        upstreamContext,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return created;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "generate_angles",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      upstreamContext,
      error,
      fallbackMessage: "AI 生成角度失败"
    });
    throw error;
  }
}

export function selectAngle(articleId: string, angleId: string, db: WorkbenchDatabase = getDatabase().db): AngleCandidate {
  const article = requireArticle(articleId, db);
  const angle = db
    .select()
    .from(angleCandidates)
    .where(and(eq(angleCandidates.id, angleId), eq(angleCandidates.articleId, articleId)))
    .get();
  if (!angle) {
    throw new Error("角度不存在");
  }
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);

  db.transaction(() => {
    db.update(angleCandidates).set({ selected: false }).where(eq(angleCandidates.articleId, articleId)).run();
    db.update(angleCandidates).set({ selected: true }).where(eq(angleCandidates.id, angleId)).run();
    db.update(articleProjects)
      .set({ selectedAngleId: angleId, updatedAt: new Date().toISOString() })
      .where(eq(articleProjects.id, articleId))
      .run();
    transitionArticle(db, article, "angle_selected", "select_angle", { angleId });
  });

  return { ...angle, selected: true };
}

// Content research commands

export async function generateContentResearch(
  articleId: string,
  input: GenerateContentResearchInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<ResearchVersion> {
  const parsed = generateContentResearchInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);
  const upstreamContext = toUpstreamContextSnapshot(topicDiagnosisContext);
  if (!article.selectedAngleId) {
    throw new Error("请先选择一个角度");
  }
  const angle = db
    .select()
    .from(angleCandidates)
    .where(and(eq(angleCandidates.id, article.selectedAngleId), eq(angleCandidates.articleId, article.id)))
    .get();
  if (!angle) {
    throw new Error("选中的角度不存在");
  }
  const stagePrompt = getStagePromptDefault("research", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "research", db);
  const prompt = buildLayeredPrompt(
    [
      renderPrompt("content_research", {
        topic: article.topic,
        targetReader: article.targetReader,
        coreProblem: article.coreProblem,
        hotAnchor: article.hotAnchor,
        angleTitle: angle.angleTitle,
        readerPain: angle.readerPain,
        promise: angle.promise,
        risk: angle.risk
      }),
      formatTopicDiagnosisContextForPrompt(topicDiagnosisContext, "content_research")
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generateContentResearch(prompt);
    const researchMarkdown = buildResearchMarkdown(generated);
    if (!researchMarkdown.trim() || !generated.summaryMarkdown.trim()) {
      throw new Error("AI 返回的研究资料包为空");
    }
    const existing = listResearchVersions(article.id, db);
    let research: ResearchVersion = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      versionNo: nextVersionNo(existing),
      sourceAngleId: angle.id,
      sourceInvocationId: null,
      summaryMarkdown: generated.summaryMarkdown,
      researchMarkdown,
      factsMarkdown: generated.factsMarkdown || null,
      backgroundMarkdown: generated.backgroundMarkdown || null,
      readerQuestionsMarkdown: generated.readerQuestionsMarkdown || null,
      boundariesMarkdown: generated.boundariesMarkdown || null,
      writeableDirectionsMarkdown: generated.writeableDirectionsMarkdown || null,
      avoidDirectionsMarkdown: generated.avoidDirectionsMarkdown || null,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "content_research",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        upstreamContext,
        status: "success"
      });
      research = { ...research, sourceInvocationId: invocationId };
      db.insert(researchVersions).values(research).run();
      db.update(articleProjects).set({ updatedAt: new Date().toISOString() }).where(eq(articleProjects.id, article.id)).run();
      recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "generate_content_research", {
        researchVersionId: research.id,
        sourceAngleId: angle.id
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return research;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "content_research",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      upstreamContext,
      error,
      fallbackMessage: "AI 内容研究失败"
    });
    throw error;
  }
}

export function saveManualResearchVersion(
  articleId: string,
  input: SaveManualResearchInput,
  db: WorkbenchDatabase = getDatabase().db
): ResearchVersion {
  const parsed = saveManualResearchInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const sourceResearch = requireResearchVersion(article.id, parsed.sourceResearchVersionId, db);
  const existing = listResearchVersions(article.id, db);
  const research: ResearchVersion = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    versionNo: nextVersionNo(existing),
    sourceAngleId: sourceResearch.sourceAngleId,
    sourceInvocationId: null,
    summaryMarkdown: parsed.summaryMarkdown,
    researchMarkdown: parsed.researchMarkdown,
    factsMarkdown: null,
    backgroundMarkdown: null,
    readerQuestionsMarkdown: null,
    boundariesMarkdown: null,
    writeableDirectionsMarkdown: null,
    avoidDirectionsMarkdown: null,
    createdBy: "user",
    createdAt: new Date().toISOString()
  };

  db.transaction(() => {
    db.insert(researchVersions).values(research).run();
    db.update(articleProjects).set({ updatedAt: new Date().toISOString() }).where(eq(articleProjects.id, article.id)).run();
    recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "save_manual_research_version", {
      researchVersionId: research.id,
      sourceResearchVersionId: sourceResearch.id,
      sourceAngleId: research.sourceAngleId
    });
  });

  return research;
}

// Outline commands

export async function generateOutline(
  articleId: string,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db,
  input: GenerateOutlineInput = {}
): Promise<OutlineVersion> {
  const parsed = generateOutlineInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);
  const upstreamContext = toUpstreamContextSnapshot(topicDiagnosisContext);
  if (!article.selectedAngleId) {
    throw new Error("请先选择一个角度");
  }
  const angle = db.select().from(angleCandidates).where(eq(angleCandidates.id, article.selectedAngleId)).get();
  if (!angle) {
    throw new Error("选中的角度不存在");
  }
  const research = parsed.researchVersionId
    ? db
        .select()
        .from(researchVersions)
        .where(and(eq(researchVersions.id, parsed.researchVersionId), eq(researchVersions.articleId, article.id)))
        .get()
    : null;
  if (parsed.researchVersionId && !research) {
    throw new Error("研究资料包不存在");
  }
  const stagePrompt = getStagePromptDefault("outline", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "outline", db);
  const prompt = buildLayeredPrompt(
    [
      renderPrompt("generate_outline", {
        topic: article.topic,
        angleTitle: angle.angleTitle,
        readerPain: angle.readerPain,
        promise: angle.promise,
        researchSummary: formatResearchForOutlinePrompt(research || null)
      }),
      formatTopicDiagnosisContextForPrompt(topicDiagnosisContext, "outline")
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generateOutline(prompt);
    if (!generated.mainline || !generated.outlineMarkdown) {
      throw new Error("AI 返回的提纲结构不完整");
    }
    const existing = listOutlines(articleId, db);
    let outline: OutlineVersion = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      versionNo: nextVersionNo(existing),
      sourceInvocationId: null,
      sourceResearchVersionId: research?.id || null,
      mainline: generated.mainline,
      outlineMarkdown: generated.outlineMarkdown,
      createdBy: "ai",
      accepted: false,
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "generate_outline",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        upstreamContext,
        status: "success"
      });
      outline = { ...outline, sourceInvocationId: invocationId };
      db.insert(outlineVersions).values(outline).run();
      transitionArticle(db, article, "outline_generated", "generate_outline", {
        outlineId: outline.id,
        sourceResearchVersionId: research?.id || null
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return outline;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "generate_outline",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      upstreamContext,
      error,
      fallbackMessage: "AI 生成提纲失败"
    });
    throw error;
  }
}

export function saveOutlineVersion(
  articleId: string,
  input: SaveOutlineInput,
  db: WorkbenchDatabase = getDatabase().db
): OutlineVersion {
  const article = requireArticle(articleId, db);
  const parsed = saveOutlineInputSchema.parse(input);
  const existing = listOutlines(articleId, db);
  const outline: OutlineVersion = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    versionNo: nextVersionNo(existing),
    sourceInvocationId: null,
    sourceResearchVersionId: null,
    mainline: parsed.mainline,
    outlineMarkdown: parsed.outlineMarkdown,
    createdBy: "user",
    accepted: false,
    createdAt: new Date().toISOString()
  };
  db.insert(outlineVersions).values(outline).run();
  return outline;
}

export function updateOutlineVersion(
  articleId: string,
  input: UpdateOutlineInput,
  db: WorkbenchDatabase = getDatabase().db
): OutlineVersion {
  const article = requireArticle(articleId, db);
  const parsed = updateOutlineInputSchema.parse(input);
  const outline = requireOutline(article.id, parsed.outlineVersionId, db);

  db.update(outlineVersions)
    .set({
      mainline: parsed.mainline,
      outlineMarkdown: parsed.outlineMarkdown
    })
    .where(eq(outlineVersions.id, outline.id))
    .run();
  recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "update_outline_version", {
    outlineVersionId: outline.id,
    versionNo: outline.versionNo
  });

  return {
    ...outline,
    mainline: parsed.mainline,
    outlineMarkdown: parsed.outlineMarkdown
  };
}

export function acceptOutline(articleId: string, outlineId: string, db: WorkbenchDatabase = getDatabase().db): OutlineVersion {
  const article = requireArticle(articleId, db);
  const outline = db
    .select()
    .from(outlineVersions)
    .where(and(eq(outlineVersions.id, outlineId), eq(outlineVersions.articleId, articleId)))
    .get();
  if (!outline) {
    throw new Error("提纲不存在");
  }

  db.transaction(() => {
    db.update(outlineVersions).set({ accepted: false }).where(eq(outlineVersions.articleId, articleId)).run();
    db.update(outlineVersions).set({ accepted: true }).where(eq(outlineVersions.id, outlineId)).run();
    if (article.status === "outline_generated") {
      transitionArticle(db, article, "outline_review", "accept_outline", { outlineId });
    }
  });

  return { ...outline, accepted: true };
}

// Draft commands

export async function generateDraft(
  articleId: string,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db,
  input: GenerateWithPromptInput = {}
): Promise<DraftVersion> {
  const parsed = generateWithPromptInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  assertTopicDiagnosisContextAllowsDownstreamFlow(article, topicDiagnosisContext);
  const upstreamContext = toUpstreamContextSnapshot(topicDiagnosisContext);
  const outline = db
    .select()
    .from(outlineVersions)
    .where(and(eq(outlineVersions.articleId, articleId), eq(outlineVersions.accepted, true)))
    .get();
  if (!outline) {
    throw new Error("请先确认提纲");
  }
  const stagePrompt = getStagePromptDefault("draft", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "draft", db);
  const prompt = buildLayeredPrompt(
    [
      renderPrompt("generate_draft", {
        topic: article.topic,
        mainline: outline.mainline,
        outlineMarkdown: outline.outlineMarkdown
      }),
      formatTopicDiagnosisContextForPrompt(topicDiagnosisContext, "draft")
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generateDraft(prompt);
    if (!generated.markdown) {
      throw new Error("AI 返回的文案为空");
    }
    const existing = listDrafts(articleId, db);
    let draft: DraftVersion = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      versionNo: nextVersionNo(existing),
      draftType: "initial",
      markdown: generated.markdown,
      html: null,
      sourceOutlineId: outline.id,
      sourceDiagnosisId: null,
      sourceAIStyleCheckId: null,
      sourceInvocationId: null,
      isFinal: false,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "generate_draft",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        upstreamContext,
        status: "success"
      });
      draft = { ...draft, sourceInvocationId: invocationId };
      db.insert(draftVersions).values(draft).run();
      transitionArticle(db, article, "draft_generated", "generate_draft", { draftId: draft.id });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return draft;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "generate_draft",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      upstreamContext,
      error,
      fallbackMessage: "AI 生成文案失败"
    });
    throw error;
  }
}

export function saveDraftVersion(
  articleId: string,
  input: SaveDraftInput,
  db: WorkbenchDatabase = getDatabase().db
): DraftVersion {
  const article = requireArticle(articleId, db);
  const parsed = saveDraftInputSchema.parse(input);
  const existing = listDrafts(articleId, db);
  const latest = existing[0];
  const draft: DraftVersion = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    versionNo: nextVersionNo(existing),
    draftType: "manual_save",
    markdown: parsed.markdown,
    html: null,
    sourceOutlineId: latest?.sourceOutlineId || null,
    sourceDiagnosisId: latest?.sourceDiagnosisId || null,
    sourceAIStyleCheckId: latest?.sourceAIStyleCheckId || null,
    sourceInvocationId: null,
    isFinal: false,
    createdBy: "user",
    createdAt: new Date().toISOString()
  };
  db.insert(draftVersions).values(draft).run();
  return draft;
}

export function updateDraftVersion(
  articleId: string,
  input: UpdateDraftInput,
  db: WorkbenchDatabase = getDatabase().db
): DraftVersion {
  const article = requireArticle(articleId, db);
  const parsed = updateDraftInputSchema.parse(input);
  const draft = requireDraft(article.id, parsed.draftVersionId, db);
  db.update(draftVersions).set({ markdown: parsed.markdown }).where(eq(draftVersions.id, draft.id)).run();
  recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "update_draft_version", {
    draftVersionId: draft.id,
    versionNo: draft.versionNo
  });
  return { ...draft, markdown: parsed.markdown };
}

// dbs-content and revision commands

export async function runDbsContent(
  articleId: string,
  input: RunDbsContentInput,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<ContentDiagnosis> {
  const article = requireArticle(articleId, db);
  const parsed = runDbsContentInputSchema.parse(input);
  const draft = requireDraft(article.id, parsed.draftVersionId, db);
  const status = article.status as ArticleStatus;
  if (!["draft_generated", "dbs_checking", "revision_generated"].includes(status)) {
    throw new Error("当前状态不能运行 dbs-content");
  }

  const stagePrompt = getStagePromptDefault("dbs", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "dbs", db);
  const prompt = buildLayeredPrompt(
    renderPrompt("dbs_content", {
      topic: article.topic,
      versionNo: String(draft.versionNo),
      markdown: draft.markdown
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );
  const requirementSnapshots = findRequirementSnapshotsForDraft(article.id, draft, db);

  try {
    const generated = await client.diagnoseContent(prompt);
    if (
      !generated.diagnosisMarkdown ||
      !generated.textCleanliness ||
      !generated.titleCover ||
      !generated.expressionEfficiency ||
      !generated.cognitiveGap ||
      !generated.aiTrace
    ) {
      throw new Error("AI 返回的诊断结构不完整");
    }

    const requirementComplianceMarkdown = buildRequirementComplianceMarkdown(draft.markdown, requirementSnapshots);
    const dbsRequirementMarkdown = buildSelectedRequirementSummaryMarkdown("本次 dbs-content 检查要求", selectedRequirements);
    const diagnosis: ContentDiagnosis = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      draftVersionId: draft.id,
      diagnosisMarkdown: `${generated.diagnosisMarkdown}${dbsRequirementMarkdown}${requirementComplianceMarkdown}`,
      textCleanliness: generated.textCleanliness,
      titleCover: generated.titleCover,
      expressionEfficiency: generated.expressionEfficiency,
      cognitiveGap: generated.cognitiveGap,
      aiTrace: generated.aiTrace,
      firstFix: generated.firstFix || null,
      sourceInvocationId: null,
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "dbs_content",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      diagnosis.sourceInvocationId = invocationId;
      db.insert(contentDiagnoses).values(diagnosis).run();
      if (status === "draft_generated" || status === "revision_generated") {
        transitionArticle(db, article, "dbs_checking", "run_dbs_content", {
          draftVersionId: draft.id,
          diagnosisId: diagnosis.id
        });
      } else {
        recordWorkflowEvent(db, article, status, "dbs_checking", "run_dbs_content", {
          draftVersionId: draft.id,
          diagnosisId: diagnosis.id
        });
      }
    });

    return diagnosis;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "dbs_content",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      error,
      fallbackMessage: "dbs-content 诊断失败"
    });
    throw error;
  }
}

export async function runAIStyleCheck(
  articleId: string,
  input: RunAIStyleCheckInput,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<AIStyleCheck> {
  const article = requireArticle(articleId, db);
  const parsed = runAIStyleCheckInputSchema.parse(input);
  const draft = requireDraft(article.id, parsed.draftVersionId, db);
  const stagePrompt = getStagePromptDefault("ai_style_check", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "ai_style_check", db);
  const selectedRequirementsSummary = selectedRequirements.length > 0 ? selectedRequirements.map((requirement) => requirement.label).join("、") : "";
  const prompt = buildLayeredPrompt(
    renderPrompt("ai_style_check", {
      title: article.title,
      topic: article.topic,
      targetReader: article.targetReader,
      coreProblem: article.coreProblem,
      customInstruction: parsed.customInstruction,
      selectedRequirementsSummary,
      draftMarkdown: draft.markdown
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements
    }
  );

  try {
    const generated = await client.runAIStyleCheck(prompt);
    if ((generated.verdict === "needs_cleanup" || generated.verdict === "heavy_slop") && generated.issues.length === 0) {
      throw new Error("AI 返回的问题列表为空");
    }

    const check: AIStyleCheck = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      draftVersionId: draft.id,
      sourceInvocationId: null,
      sourceType: "draft_version",
      cleanlinessVerdict: generated.verdict,
      score: generated.score,
      issueCount: generated.issues.length,
      summaryMarkdown: generated.summaryMarkdown,
      issuesJson: JSON.stringify(generated.issues),
      customInstructionSnapshot: parsed.customInstruction || null,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "ai_style_check",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      check.sourceInvocationId = invocationId;
      db.insert(aiStyleChecks).values(check).run();
      recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "run_ai_style_check", {
        draftVersionId: draft.id,
        checkId: check.id,
        verdict: check.cleanlinessVerdict,
        issueCount: check.issueCount
      });
    });

    return check;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "ai_style_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      error,
      fallbackMessage: "文案清洁检查失败"
    });
    throw error;
  }
}

export async function reviseFromAIStyleCheck(
  articleId: string,
  input: ReviseFromAIStyleCheckInput,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<DraftVersion> {
  const article = requireArticle(articleId, db);
  const parsed = reviseFromAIStyleCheckInputSchema.parse(input);
  const check = requireAIStyleCheck(article.id, parsed.checkId, db);
  if (check.sourceType !== "draft_version") {
    throw new Error("只能基于文案版本的清洁检查生成清洁版文案");
  }
  const sourceDraft = requireDraft(article.id, check.draftVersionId, db);
  const prompt = renderPrompt("revise_from_ai_style_check", {
    topic: article.topic,
    versionNo: String(sourceDraft.versionNo),
    markdown: sourceDraft.markdown,
    summaryMarkdown: check.summaryMarkdown,
    issuesMarkdown: formatAIStyleCheckIssuesForPrompt(check)
  });

  try {
    const generated = await client.reviseDraft(prompt);
    if (!generated.markdown) {
      throw new Error("AI 返回的清洁版文案为空");
    }

    const existing = listDrafts(article.id, db);
    let draft: DraftVersion = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      versionNo: nextVersionNo(existing),
      draftType: "revision",
      markdown: generated.markdown,
      html: null,
      sourceOutlineId: sourceDraft.sourceOutlineId,
      sourceDiagnosisId: sourceDraft.sourceDiagnosisId,
      sourceAIStyleCheckId: check.id,
      sourceInvocationId: null,
      isFinal: false,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };
    const status = article.status as ArticleStatus;

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "revise_from_ai_style_check",
        client,
        prompt,
        response: generated,
        status: "success"
      });
      draft = { ...draft, sourceInvocationId: invocationId };
      db.insert(draftVersions).values(draft).run();
      recordWorkflowEvent(db, article, status, status, "revise_from_ai_style_check", {
        checkId: check.id,
        sourceDraftVersionId: sourceDraft.id,
        draftId: draft.id
      });
    });

    return draft;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "revise_from_ai_style_check",
      client,
      prompt,
      error,
      fallbackMessage: "生成清洁版文案失败"
    });
    throw error;
  }
}

export async function reviseFromDiagnosis(
  articleId: string,
  input: ReviseFromDiagnosisInput,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<DraftVersion> {
  const article = requireArticle(articleId, db);
  const parsed = reviseFromDiagnosisInputSchema.parse(input);
  const diagnosis = requireDiagnosis(article.id, parsed.diagnosisId, db);
  const sourceDraft = requireDraft(article.id, diagnosis.draftVersionId, db);
  const status = article.status as ArticleStatus;
  if (!["dbs_checking", "revision_generated"].includes(status)) {
    throw new Error("请先运行 dbs-content 诊断");
  }

  const prompt = renderPrompt("revise_from_diagnosis", {
    topic: article.topic,
    versionNo: String(sourceDraft.versionNo),
    markdown: sourceDraft.markdown,
    diagnosisMarkdown: diagnosis.diagnosisMarkdown
  });

  try {
    const generated = await client.reviseDraft(prompt);
    if (!generated.markdown) {
      throw new Error("AI 返回的修改稿为空");
    }

    const existing = listDrafts(articleId, db);
    let draft: DraftVersion = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      versionNo: nextVersionNo(existing),
      draftType: "revision",
      markdown: generated.markdown,
      html: null,
      sourceOutlineId: sourceDraft.sourceOutlineId,
      sourceDiagnosisId: diagnosis.id,
      sourceAIStyleCheckId: null,
      sourceInvocationId: null,
      isFinal: false,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "revise_from_diagnosis",
        client,
        prompt,
        response: generated,
        status: "success"
      });
      draft = { ...draft, sourceInvocationId: invocationId };
      db.insert(draftVersions).values(draft).run();
      if (status === "dbs_checking") {
        transitionArticle(db, article, "revision_generated", "revise_from_diagnosis", {
          diagnosisId: diagnosis.id,
          draftId: draft.id
        });
      } else {
        recordWorkflowEvent(db, article, status, "revision_generated", "revise_from_diagnosis", {
          diagnosisId: diagnosis.id,
          draftId: draft.id
        });
      }
    });

    return draft;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "revise_from_diagnosis",
      client,
      prompt,
      error,
      fallbackMessage: "生成修改稿失败"
    });
    throw error;
  }
}

export async function runPublishHTMLAIStyleCheck(
  articleId: string,
  input: RunPublishHTMLAIStyleCheckInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<AIStyleCheck> {
  const article = requireArticle(articleId, db);
  const parsed = runPublishHTMLAIStyleCheckInputSchema.parse(input);
  const finalDraft = requireFinalDraft(article, db);
  const htmlAsset = requireHTMLAsset(article.id, finalDraft.id, parsed.htmlAssetId, db);
  const plainText = htmlToPlainText(readFileSync(htmlAsset.path, "utf8"));
  if (!plainText) {
    throw new Error("HTML 资产没有可检查的文本");
  }
  const stagePrompt = getStagePromptDefault("ai_style_check", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "ai_style_check", db);
  const selectedRequirementsSummary = selectedRequirements.length > 0 ? selectedRequirements.map((requirement) => requirement.label).join("、") : "";
  const prompt = buildLayeredPrompt(
    renderPrompt("ai_style_check", {
      title: article.title,
      topic: article.topic,
      targetReader: article.targetReader,
      coreProblem: article.coreProblem,
      customInstruction: parsed.customInstruction,
      selectedRequirementsSummary,
      draftMarkdown: plainText
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements
    }
  );

  try {
    const generated = await client.runAIStyleCheck(prompt);
    if ((generated.verdict === "needs_cleanup" || generated.verdict === "heavy_slop") && generated.issues.length === 0) {
      throw new Error("AI 返回的问题列表为空");
    }

    const check: AIStyleCheck = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      draftVersionId: finalDraft.id,
      sourceInvocationId: null,
      sourceType: "publish_html",
      cleanlinessVerdict: generated.verdict,
      score: generated.score,
      issueCount: generated.issues.length,
      summaryMarkdown: generated.summaryMarkdown,
      issuesJson: JSON.stringify(generated.issues),
      customInstructionSnapshot: parsed.customInstruction || null,
      createdBy: "ai",
      createdAt: new Date().toISOString()
    };
    const status = article.status as ArticleStatus;

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "publish_html_ai_style_check",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      check.sourceInvocationId = invocationId;
      db.insert(aiStyleChecks).values(check).run();
      recordWorkflowEvent(db, article, status, status, "run_publish_html_ai_style_check", {
        draftVersionId: finalDraft.id,
        htmlAssetId: htmlAsset.id,
        checkId: check.id,
        verdict: check.cleanlinessVerdict,
        issueCount: check.issueCount
      });
    });

    return check;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "publish_html_ai_style_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      error,
      fallbackMessage: "发布 HTML 文案清洁检查失败"
    });
    throw error;
  }
}

export function markFinalDraft(
  articleId: string,
  input: MarkFinalDraftInput,
  db: WorkbenchDatabase = getDatabase().db
): DraftVersion {
  const article = requireArticle(articleId, db);
  const parsed = markFinalDraftInputSchema.parse(input);
  const draft = requireDraft(article.id, parsed.draftVersionId, db);
  const status = article.status as ArticleStatus;
  if (isFinalDraftLockedStatus(status)) {
    throw new Error("文章已进入发布或复盘流程，不能重新标记最终稿");
  }
  const latestCheck = getLatestDraftVersionAIStyleCheck(article.id, draft.id, db);
  if (latestCheck?.cleanlinessVerdict === "heavy_slop" && !parsed.force) {
    throw new Error("仍存在明显表达水分，是否继续标记最终稿");
  }

  db.transaction(() => {
    const nextStatus: ArticleStatus = status === "human_review" ? status : "human_review";
    const updatedAt = new Date().toISOString();
    if (latestCheck?.cleanlinessVerdict === "heavy_slop" && parsed.force) {
      recordWorkflowEvent(db, article, status, status, "confirm_final_draft_ai_style_check_gate", {
        draftVersionId: draft.id,
        checkId: latestCheck.id,
        verdict: latestCheck.cleanlinessVerdict
      });
    }
    db.update(draftVersions).set({ isFinal: false }).where(eq(draftVersions.articleId, article.id)).run();
    db.update(draftVersions).set({ isFinal: true }).where(eq(draftVersions.id, draft.id)).run();
    db.update(articleProjects)
      .set({ finalDraftVersionId: draft.id, status: nextStatus, updatedAt })
      .where(eq(articleProjects.id, article.id))
      .run();
    recordWorkflowEvent(db, article, status, nextStatus, "mark_final_draft", {
      draftVersionId: draft.id,
      aiStyleCheckId: latestCheck?.id || null,
      aiStyleCheckVerdict: latestCheck?.cleanlinessVerdict || null,
      aiStyleCheckGateConfirmed: latestCheck?.cleanlinessVerdict === "heavy_slop" && parsed.force
    });
  });

  return { ...draft, isFinal: true };
}

// Publish and review commands

export function markReadyToPublish(articleId: string, db: WorkbenchDatabase = getDatabase().db): ArticleProject {
  const article = requireArticle(articleId, db);
  const status = article.status as ArticleStatus;
  if (!article.finalDraftVersionId) {
    throw new Error("请先标记最终稿");
  }
  const finalDraft = requireDraft(article.id, article.finalDraftVersionId, db);
  if (!finalDraft.isFinal) {
    throw new Error("最终稿状态不一致，请重新标记最终稿");
  }
  if (status === "ready_to_publish") {
    return article;
  }
  return transitionArticle(db, article, "ready_to_publish", "mark_ready_to_publish", {
    draftVersionId: finalDraft.id
  });
}

export async function runPrePublishCheck(
  articleId: string,
  input: PrePublishCheckInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<PromptRunArtifact> {
  const article = requireArticle(articleId, db);
  const parsed = prePublishCheckInputSchema.parse(input);
  const finalDraft = requireFinalDraft(article, db);
  const publishContext = getPublishContext(article.id, db);
  const stagePrompt = getStagePromptDefault("pre_publish", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "pre_publish", db);
  const prompt = buildLayeredPrompt(
    renderPrompt("pre_publish_check", {
      topic: article.topic,
      title: article.title,
      versionNo: String(finalDraft.versionNo),
      markdown: finalDraft.markdown,
      htmlAssetCount: String(publishContext.htmlAssetCount),
      coverAssetCount: String(publishContext.coverAssetCount),
      uploadStatus: publishContext.uploadStatus
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generatePrePublishCheck(prompt);
    if (!generated.summaryMarkdown) {
      throw new Error("AI 返回的发布前检查摘要为空");
    }

    const requirementMarkdown = buildSelectedRequirementSummaryMarkdown("本次发布前检查要求", selectedRequirements);
    let artifact: PromptRunArtifact = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      stage: "pre_publish",
      sourceDraftVersionId: finalDraft.id,
      sourceInvocationId: null,
      summaryMarkdown: `${generated.summaryMarkdown}${requirementMarkdown}`,
      createdAt: new Date().toISOString()
    };
    const status = article.status as ArticleStatus;

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "pre_publish_check",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      artifact = { ...artifact, sourceInvocationId: invocationId };
      db.insert(promptRunArtifacts).values(artifact).run();
      recordWorkflowEvent(db, article, status, status, "pre_publish_check", {
        artifactId: artifact.id,
        draftVersionId: finalDraft.id
      });
    });

    return artifact;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "pre_publish_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      error,
      fallbackMessage: "生成发布前检查摘要失败"
    });
    throw error;
  }
}

export async function runReviewCheck(
  articleId: string,
  input: ReviewCheckInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<PromptRunArtifact> {
  const article = requireArticle(articleId, db);
  const parsed = reviewCheckInputSchema.parse(input);
  const finalDraft = requireFinalDraft(article, db);
  const publishContext = getPublishContext(article.id, db);
  const stagePrompt = getStagePromptDefault("review", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "review", db);
  const prompt = buildLayeredPrompt(
    renderPrompt("review_check", {
      topic: article.topic,
      title: article.title,
      versionNo: String(finalDraft.versionNo),
      status: getStatusLabel(article.status as ArticleStatus),
      uploadStatus: publishContext.uploadStatus,
      markdown: finalDraft.markdown
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements,
      customInstruction: parsed.customInstruction
    }
  );

  try {
    const generated = await client.generateReviewCheck(prompt);
    if (!generated.summaryMarkdown) {
      throw new Error("AI 返回的复盘检查清单为空");
    }

    const requirementMarkdown = buildSelectedRequirementSummaryMarkdown("本次复盘检查要求", selectedRequirements);
    let artifact: PromptRunArtifact = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      stage: "review",
      sourceDraftVersionId: finalDraft.id,
      sourceInvocationId: null,
      summaryMarkdown: `${generated.summaryMarkdown}${requirementMarkdown}`,
      createdAt: new Date().toISOString()
    };
    const status = article.status as ArticleStatus;

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "review_check",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      artifact = { ...artifact, sourceInvocationId: invocationId };
      db.insert(promptRunArtifacts).values(artifact).run();
      recordWorkflowEvent(db, article, status, status, "review_check", {
        artifactId: artifact.id,
        draftVersionId: finalDraft.id
      });
    });

    return artifact;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      taskType: "review_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      error,
      fallbackMessage: "生成复盘检查清单失败"
    });
    throw error;
  }
}

// Miscellaneous application helpers

export function listPublishQueueArticles(db: WorkbenchDatabase = getDatabase().db): ArticleListItem[] {
  return listArticles({ publishQueueOnly: true }, db).filter((article) => isPublishQueueStatus(article.status as ArticleStatus));
}

export function updateArticle(
  id: string,
  input: UpdateArticleInput,
  db: WorkbenchDatabase = getDatabase().db
): ArticleProject | null {
  const parsed = updateArticleInputSchema.parse(input);
  const existing = getArticle(id, db);
  if (!existing) {
    return null;
  }
  const hasValue = (key: keyof UpdateArticleInput) => Object.prototype.hasOwnProperty.call(parsed, key);
  const values = {
    topic: hasValue("topic") ? (parsed.topic as string) : existing.topic,
    title: hasValue("topic") ? titleFromTopic(parsed.topic as string) : existing.title,
    targetReader: hasValue("targetReader") ? parsed.targetReader || null : existing.targetReader,
    coreProblem: hasValue("coreProblem") ? parsed.coreProblem || null : existing.coreProblem,
    hotAnchor: hasValue("hotAnchor") ? parsed.hotAnchor || null : existing.hotAnchor,
    updatedAt: new Date().toISOString()
  };

  const topicFieldsChanged =
    values.topic !== existing.topic ||
    values.targetReader !== existing.targetReader ||
    values.coreProblem !== existing.coreProblem ||
    values.hotAnchor !== existing.hotAnchor;

  db.transaction(() => {
    db.update(articleProjects).set(values).where(eq(articleProjects.id, id)).run();
    if (topicFieldsChanged) {
      db.insert(topicVersions)
        .values(
          createTopicVersionRecord(
            {
              id: existing.id,
              ownerId: existing.ownerId,
              topic: values.topic,
              targetReader: values.targetReader,
              coreProblem: values.coreProblem,
              hotAnchor: values.hotAnchor
            },
            latestTopicVersionNo(existing.id, db) + 1,
            "user_edit",
            values.updatedAt
          )
        )
        .run();
    }
  });
  return db.select().from(articleProjects).where(eq(articleProjects.id, id)).get() ?? null;
}

export function ensureAppDataReady(): void {
  ensureDatabaseReady();
}
