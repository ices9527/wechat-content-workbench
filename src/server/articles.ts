import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { assertCanTransition, getNextAction, getStatusLabel, isPublishQueueStatus, type ArticleStatus } from "@/domain/status";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { ensureDatabaseReady } from "@/db/ensure";
import { LOCAL_USER_ID } from "@/db/seed";
import {
  aiInvocations,
  aiInvocationRequirements,
  angleCandidates,
  articleAssets,
  articleProjects,
  contentDiagnoses,
  draftVersions,
  outlineVersions,
  promptRunArtifacts,
  requirementPresets,
  stagePromptDefaults,
  topicDiagnoses,
  wechatDraftUploads,
  workflowEvents,
  type AngleCandidate,
  type AIInvocation,
  type ArticleProject,
  type ContentDiagnosis,
  type DraftVersion,
  type OutlineVersion,
  type PromptRunArtifact,
  type RequirementPreset,
  type AIInvocationRequirement,
  type StagePromptDefault,
  type TopicDiagnosis
} from "@/db/schema";

import type { AIClient, GeneratedAngle, GeneratedTopicDiagnosis } from "./ai";
import { getAIClient } from "./ai";
import { buildLayeredPrompt, renderPrompt } from "./prompts";

export const createArticleInputSchema = z.object({
  topic: z.string().trim().min(1, "主题不能为空"),
  targetReader: z.string().trim().optional(),
  coreProblem: z.string().trim().optional(),
  hotAnchor: z.string().trim().optional()
});

export type CreateArticleInput = z.infer<typeof createArticleInputSchema>;

export type ArticleListItem = ArticleProject & {
  statusLabel: string;
  nextAction: string;
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
    .max(2000, "本次提示词不能超过 2000 字")
    .optional()
    .transform((value) => value || undefined),
  selectedRequirementIds: z.array(z.string().trim().min(1, "可选提示词 ID 不能为空")).optional().default([])
};

export const generateWithPromptInputSchema = z.object(promptControlInputShape);
export const topicDiagnosisInputSchema = z.object({
  customInstruction: promptControlInputShape.customInstruction
});

export const requirementStageSchema = z.enum(["angle", "outline", "draft", "dbs", "pre_publish", "review"]);
export const stagePromptStageSchema = requirementStageSchema;

export const requirementTypeSchema = z.enum(["must", "avoid", "prefer", "check", "compliance"]);

export const createRequirementInputSchema = z.object({
  stage: requirementStageSchema,
  category: z.string().trim().min(1, "分类不能为空").max(40, "分类不能超过 40 字"),
  type: requirementTypeSchema,
  label: z.string().trim().min(1, "标签不能为空").max(80, "标签不能超过 80 字"),
  description: z.string().trim().max(240, "说明不能超过 240 字").optional(),
  promptFragment: z.string().trim().min(1, "提示词不能为空").max(2000, "提示词不能超过 2000 字"),
  defaultEnabled: z.boolean().optional().default(false),
  priority: z.coerce.number().int().min(0).max(9999).optional().default(500)
});

export const updateRequirementInputSchema = z.object({
  stage: requirementStageSchema.optional(),
  category: z.string().trim().min(1, "分类不能为空").max(40, "分类不能超过 40 字").optional(),
  type: requirementTypeSchema.optional(),
  label: z.string().trim().min(1, "标签不能为空").max(80, "标签不能超过 80 字").optional(),
  description: z.string().trim().max(240, "说明不能超过 240 字").optional(),
  promptFragment: z.string().trim().min(1, "提示词不能为空").max(2000, "提示词不能超过 2000 字").optional(),
  defaultEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  archived: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(9999).optional()
});

export const updateStagePromptInputSchema = z.object({
  stage: stagePromptStageSchema,
  label: z.string().trim().min(1, "名称不能为空").max(80, "名称不能超过 80 字").optional(),
  prompt: z.string().trim().max(8000, "默认提示词不能超过 8000 字").default(""),
  enabled: z.boolean().optional()
});

export const runDbsContentInputSchema = z.object({
  draftVersionId: z.string().trim().min(1, "必须指定文案版本"),
  ...promptControlInputShape
});

export const prePublishCheckInputSchema = z.object(promptControlInputShape);

export const reviewCheckInputSchema = z.object(promptControlInputShape);

export const reviseFromDiagnosisInputSchema = z.object({
  diagnosisId: z.string().trim().min(1, "必须指定诊断记录")
});

export const markFinalDraftInputSchema = z.object({
  draftVersionId: z.string().trim().min(1, "必须指定最终稿版本")
});

export type ManualAngleInput = z.infer<typeof manualAngleInputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftInputSchema>;
export type SaveOutlineInput = z.infer<typeof saveOutlineInputSchema>;
export type UpdateOutlineInput = z.infer<typeof updateOutlineInputSchema>;
export type GenerateWithPromptInput = z.input<typeof generateWithPromptInputSchema>;
export type TopicDiagnosisInput = z.input<typeof topicDiagnosisInputSchema>;
export type StagePromptStage = z.infer<typeof stagePromptStageSchema>;
export type RequirementStage = z.infer<typeof requirementStageSchema>;
export type CreateRequirementInput = z.infer<typeof createRequirementInputSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementInputSchema>;
export type UpdateStagePromptInput = z.infer<typeof updateStagePromptInputSchema>;
export type RunDbsContentInput = z.input<typeof runDbsContentInputSchema>;
export type PrePublishCheckInput = z.input<typeof prePublishCheckInputSchema>;
export type ReviewCheckInput = z.input<typeof reviewCheckInputSchema>;
export type ReviseFromDiagnosisInput = z.infer<typeof reviseFromDiagnosisInputSchema>;
export type MarkFinalDraftInput = z.infer<typeof markFinalDraftInputSchema>;

export type PromptRecipeRequirement = {
  id: string;
  requirementPresetId: string;
  stableKey: string;
  label: string;
  promptFragment: string;
  stage: string;
  createdAt: string;
};

export type PromptRecipe = {
  articleId: string;
  invocationId: string | null;
  taskType: string | null;
  model: string | null;
  baseUrl: string | null;
  status: string | null;
  createdAt: string | null;
  stageDefaultPrompt: {
    label: string;
    prompt: string;
  } | null;
  selectedRequirements: PromptRecipeRequirement[];
  customInstruction: string | null;
  finalPrompt: string | null;
  emptyReason?: string;
};

function titleFromTopic(topic: string): string {
  return topic.length > 48 ? `${topic.slice(0, 48)}...` : topic;
}

function toListItem(article: ArticleProject): ArticleListItem {
  const status = article.status as ArticleStatus;
  return {
    ...article,
    statusLabel: getStatusLabel(status),
    nextAction: getNextAction(status)
  };
}

function requireArticle(id: string, db: WorkbenchDatabase): ArticleProject {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, id)).get();
  if (!article) {
    throw new Error("文章不存在");
  }
  return article;
}

function requireDraft(articleId: string, draftVersionId: string, db: WorkbenchDatabase): DraftVersion {
  const draft = db
    .select()
    .from(draftVersions)
    .where(and(eq(draftVersions.id, draftVersionId), eq(draftVersions.articleId, articleId)))
    .get();
  if (!draft) {
    throw new Error("文案版本不存在");
  }
  return draft;
}

function requireOutline(articleId: string, outlineVersionId: string, db: WorkbenchDatabase): OutlineVersion {
  const outline = db
    .select()
    .from(outlineVersions)
    .where(and(eq(outlineVersions.id, outlineVersionId), eq(outlineVersions.articleId, articleId)))
    .get();
  if (!outline) {
    throw new Error("提纲版本不存在");
  }
  return outline;
}

function requireDiagnosis(articleId: string, diagnosisId: string, db: WorkbenchDatabase): ContentDiagnosis {
  const diagnosis = db
    .select()
    .from(contentDiagnoses)
    .where(and(eq(contentDiagnoses.id, diagnosisId), eq(contentDiagnoses.articleId, articleId)))
    .get();
  if (!diagnosis) {
    throw new Error("诊断记录不存在");
  }
  return diagnosis;
}

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
      status: input.status,
      errorMessage: input.errorMessage || null
    })
    .run();
  return id;
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

function defaultStagePromptLabel(stage: StagePromptStage): string {
  const labels: Record<StagePromptStage, string> = {
    angle: "角度默认提示词",
    outline: "主线提纲默认提示词",
    draft: "Markdown 文案默认提示词",
    dbs: "dbs-content 默认提示词",
    pre_publish: "发布前默认提示词",
    review: "复盘默认提示词"
  };
  return labels[stage];
}

function buildSelectedRequirementSummaryMarkdown(title: string, requirements: RequirementPreset[]): string {
  if (requirements.length === 0) {
    return "";
  }
  return ["", `## ${title}`, ...requirements.map((requirement) => `- ${requirement.label}：${requirement.promptFragment}`)].join("\n");
}

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

  db.insert(articleProjects).values(article).run();
  return article;
}

export function listArticles(
  filters: { status?: ArticleStatus; publishQueueOnly?: boolean } = {},
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
  return rows.map(toListItem);
}

export function getArticle(id: string, db: WorkbenchDatabase = getDatabase().db): ArticleListItem | null {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, id)).get();
  return article ? toListItem(article) : null;
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

export function listTopicDiagnoses(articleId: string, db: WorkbenchDatabase = getDatabase().db): TopicDiagnosis[] {
  return db
    .select()
    .from(topicDiagnoses)
    .where(eq(topicDiagnoses.articleId, articleId))
    .orderBy(desc(topicDiagnoses.createdAt))
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

export function listStagePromptDefaults(db: WorkbenchDatabase = getDatabase().db): StagePromptDefault[] {
  return db.select().from(stagePromptDefaults).where(eq(stagePromptDefaults.ownerId, LOCAL_USER_ID)).all();
}

export function getStagePromptDefault(
  stage: StagePromptStage,
  db: WorkbenchDatabase = getDatabase().db
): StagePromptDefault | null {
  return (
    db
      .select()
      .from(stagePromptDefaults)
      .where(and(eq(stagePromptDefaults.ownerId, LOCAL_USER_ID), eq(stagePromptDefaults.stage, stage)))
      .get() || null
  );
}

export function updateStagePromptDefault(
  input: UpdateStagePromptInput,
  db: WorkbenchDatabase = getDatabase().db
): StagePromptDefault {
  const parsed = updateStagePromptInputSchema.parse(input);
  const existing = getStagePromptDefault(parsed.stage, db);
  const now = new Date().toISOString();

  if (existing) {
    db.update(stagePromptDefaults)
      .set({
        label: parsed.label ?? existing.label,
        prompt: parsed.prompt,
        enabled: parsed.enabled ?? existing.enabled,
        updatedAt: now
      })
      .where(eq(stagePromptDefaults.id, existing.id))
      .run();
    return {
      ...existing,
      label: parsed.label ?? existing.label,
      prompt: parsed.prompt,
      enabled: parsed.enabled ?? existing.enabled,
      updatedAt: now
    };
  }

  const created: StagePromptDefault = {
    id: `${LOCAL_USER_ID}_${parsed.stage}`,
    ownerId: LOCAL_USER_ID,
    stage: parsed.stage,
    label: parsed.label ?? defaultStagePromptLabel(parsed.stage),
    prompt: parsed.prompt,
    enabled: parsed.enabled ?? true,
    createdAt: now,
    updatedAt: now
  };
  db.insert(stagePromptDefaults).values(created).run();
  return created;
}

export function listRequirementPresets(
  input: { stage?: RequirementStage; includeArchived?: boolean } = {},
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset[] {
  const parsedStage = input.stage ? requirementStageSchema.parse(input.stage) : undefined;
  const conditions = [eq(requirementPresets.ownerId, LOCAL_USER_ID)];

  if (parsedStage) {
    conditions.push(eq(requirementPresets.stage, parsedStage));
  }
  if (!input.includeArchived) {
    conditions.push(eq(requirementPresets.enabled, true));
    conditions.push(isNull(requirementPresets.archivedAt));
  }

  return db
    .select()
    .from(requirementPresets)
    .where(and(...conditions))
    .orderBy(asc(requirementPresets.stage), asc(requirementPresets.category), asc(requirementPresets.priority))
    .all();
}

export function resolveSelectedRequirements(
  ids: string[] | undefined,
  stage: RequirementStage,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset[] {
  const parsedStage = requirementStageSchema.parse(stage);
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));

  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = db
    .select()
    .from(requirementPresets)
    .where(and(eq(requirementPresets.ownerId, LOCAL_USER_ID), inArray(requirementPresets.id, uniqueIds)))
    .orderBy(asc(requirementPresets.priority))
    .all();

  if (rows.length !== uniqueIds.length) {
    throw new Error("可选提示词不存在");
  }

  const invalid = rows.find((row) => row.stage !== parsedStage || !row.enabled || row.archivedAt);
  if (invalid) {
    throw new Error("可选提示词不适用于当前阶段");
  }

  return rows;
}

export function createRequirementPreset(
  input: CreateRequirementInput,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset {
  const parsed = createRequirementInputSchema.parse(input);
  const now = new Date().toISOString();
  const requirement: RequirementPreset = {
    id: randomUUID(),
    stableKey: `USER-${randomUUID()}`,
    ownerId: LOCAL_USER_ID,
    stage: parsed.stage,
    category: parsed.category,
    type: parsed.type,
    label: parsed.label,
    description: parsed.description || parsed.label,
    promptFragment: parsed.promptFragment,
    defaultEnabled: parsed.defaultEnabled,
    enabled: true,
    priority: parsed.priority,
    source: "user",
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
  db.insert(requirementPresets).values(requirement).run();
  return requirement;
}

function requireRequirementPreset(id: string, db: WorkbenchDatabase): RequirementPreset {
  const requirement = db
    .select()
    .from(requirementPresets)
    .where(and(eq(requirementPresets.id, id), eq(requirementPresets.ownerId, LOCAL_USER_ID)))
    .get();
  if (!requirement) {
    throw new Error("可选提示词不存在");
  }
  return requirement;
}

export function updateRequirementPreset(
  id: string,
  input: UpdateRequirementInput,
  db: WorkbenchDatabase = getDatabase().db
): RequirementPreset {
  const existing = requireRequirementPreset(id, db);
  const parsed = updateRequirementInputSchema.parse(input);
  const now = new Date().toISOString();
  const values = {
    stage: parsed.stage ?? existing.stage,
    category: parsed.category ?? existing.category,
    type: parsed.type ?? existing.type,
    label: parsed.label ?? existing.label,
    description: parsed.description ?? existing.description,
    promptFragment: parsed.promptFragment ?? existing.promptFragment,
    defaultEnabled: parsed.defaultEnabled ?? existing.defaultEnabled,
    enabled: parsed.enabled ?? existing.enabled,
    priority: parsed.priority ?? existing.priority,
    archivedAt: parsed.archived === undefined ? existing.archivedAt : parsed.archived ? now : null,
    updatedAt: now
  };

  db.update(requirementPresets).set(values).where(eq(requirementPresets.id, existing.id)).run();
  return { ...existing, ...values };
}

export function deleteRequirementPreset(
  id: string,
  db: WorkbenchDatabase = getDatabase().db
): { deleted: boolean; archived: boolean; requirement: RequirementPreset } {
  const existing = requireRequirementPreset(id, db);
  const used = db
    .select()
    .from(aiInvocationRequirements)
    .where(eq(aiInvocationRequirements.requirementPresetId, existing.id))
    .get();

  if (used) {
    const archived = updateRequirementPreset(
      existing.id,
      {
        enabled: false,
        archived: true
      },
      db
    );
    return { deleted: false, archived: true, requirement: archived };
  }

  db.delete(requirementPresets).where(eq(requirementPresets.id, existing.id)).run();
  return { deleted: true, archived: false, requirement: existing };
}

function listRequirementSnapshotsForInvocation(
  aiInvocationId: string,
  db: WorkbenchDatabase
): AIInvocationRequirement[] {
  return db
    .select()
    .from(aiInvocationRequirements)
    .where(eq(aiInvocationRequirements.aiInvocationId, aiInvocationId))
    .orderBy(asc(aiInvocationRequirements.createdAt))
    .all();
}

function findRequirementSnapshotsForDraft(
  articleId: string,
  draft: DraftVersion,
  db: WorkbenchDatabase
): AIInvocationRequirement[] {
  if (draft.sourceInvocationId) {
    return listRequirementSnapshotsForInvocation(draft.sourceInvocationId, db);
  }

  const invocations = db
    .select()
    .from(aiInvocations)
    .where(and(eq(aiInvocations.articleId, articleId), eq(aiInvocations.taskType, "generate_draft")))
    .orderBy(desc(aiInvocations.createdAt))
    .all();

  for (const invocation of invocations) {
    if (!invocation.response) {
      continue;
    }
    try {
      const response = JSON.parse(invocation.response) as { markdown?: string };
      if (response.markdown && draft.markdown.includes(response.markdown.slice(0, 80))) {
        return listRequirementSnapshotsForInvocation(invocation.id, db);
      }
    } catch {
      continue;
    }
  }

  return [];
}

function toPromptRecipeRequirement(requirement: AIInvocationRequirement): PromptRecipeRequirement {
  return {
    id: requirement.id,
    requirementPresetId: requirement.requirementPresetId,
    stableKey: requirement.stableKeySnapshot,
    label: requirement.labelSnapshot,
    promptFragment: requirement.promptFragmentSnapshot,
    stage: requirement.stageSnapshot,
    createdAt: requirement.createdAt
  };
}

function emptyPromptRecipe(articleId: string, reason: string): PromptRecipe {
  return {
    articleId,
    invocationId: null,
    taskType: null,
    model: null,
    baseUrl: null,
    status: null,
    createdAt: null,
    stageDefaultPrompt: null,
    selectedRequirements: [],
    customInstruction: null,
    finalPrompt: null,
    emptyReason: reason
  };
}

function requireInvocationRecipe(articleId: string, invocationId: string, db: WorkbenchDatabase): PromptRecipe {
  const invocation = db
    .select()
    .from(aiInvocations)
    .where(and(eq(aiInvocations.id, invocationId), eq(aiInvocations.articleId, articleId)))
    .get() as AIInvocation | undefined;

  if (!invocation) {
    return emptyPromptRecipe(articleId, "没有找到对应的 AI 调用记录。");
  }

  const selectedRequirements = listRequirementSnapshotsForInvocation(invocation.id, db).map(toPromptRecipeRequirement);
  const stageDefaultPrompt = invocation.stagePromptSnapshot
    ? {
        label: invocation.stagePromptLabelSnapshot || "默认提示词",
        prompt: invocation.stagePromptSnapshot
      }
    : null;

  return {
    articleId,
    invocationId: invocation.id,
    taskType: invocation.taskType,
    model: invocation.model,
    baseUrl: invocation.baseUrl,
    status: invocation.status,
    createdAt: invocation.createdAt,
    stageDefaultPrompt,
    selectedRequirements,
    customInstruction: invocation.customInstruction,
    finalPrompt: invocation.prompt
  };
}

export function getPromptRecipeForInvocation(
  articleId: string,
  invocationId: string,
  db: WorkbenchDatabase = getDatabase().db
): PromptRecipe {
  const article = requireArticle(articleId, db);
  return requireInvocationRecipe(article.id, invocationId, db);
}

export function getPromptRecipeForOutline(
  articleId: string,
  outlineVersionId: string,
  db: WorkbenchDatabase = getDatabase().db
): PromptRecipe {
  const article = requireArticle(articleId, db);
  const outline = requireOutline(article.id, outlineVersionId, db);
  if (!outline.sourceInvocationId) {
    return emptyPromptRecipe(article.id, "这个提纲版本没有绑定 AI 提示词记录，可能是人工保存或旧版本数据。");
  }
  return requireInvocationRecipe(article.id, outline.sourceInvocationId, db);
}

export function getPromptRecipeForDraft(
  articleId: string,
  draftVersionId: string,
  db: WorkbenchDatabase = getDatabase().db
): PromptRecipe {
  const article = requireArticle(articleId, db);
  const draft = requireDraft(article.id, draftVersionId, db);
  if (!draft.sourceInvocationId) {
    return emptyPromptRecipe(article.id, "这个文案版本没有绑定 AI 提示词记录，可能是人工保存或旧版本数据。");
  }
  return requireInvocationRecipe(article.id, draft.sourceInvocationId, db);
}

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
    generated.targetReaderCheck,
    generated.readerProblemCheck,
    generated.timelinessCheck,
    generated.actionabilityCheck,
    generated.riskSummary,
    generated.suggestionsMarkdown,
    generated.nextAction
  ].some((value) => value.trim().length > 0);
}

export function createManualAngle(
  articleId: string,
  input: ManualAngleInput,
  db: WorkbenchDatabase = getDatabase().db
): AngleCandidate {
  const article = requireArticle(articleId, db);
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
  const prompt = buildLayeredPrompt(
    renderPrompt("topic_diagnosis", {
      topic: article.topic,
      targetReader: article.targetReader,
      coreProblem: article.coreProblem,
      hotAnchor: article.hotAnchor
    }),
    {
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
      verdict: generated.verdict,
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
    recordAIInvocation(db, {
      article,
      taskType: "topic_diagnosis",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI 选题诊断失败"
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
  const stagePrompt = getStagePromptDefault("angle", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "angle", db);
  const prompt = buildLayeredPrompt(
    renderPrompt("generate_angles", {
      topic: article.topic,
      targetReader: article.targetReader,
      coreProblem: article.coreProblem,
      hotAnchor: article.hotAnchor
    }),
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
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return created;
  } catch (error) {
    recordAIInvocation(db, {
      article,
      taskType: "generate_angles",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI 生成角度失败"
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

export async function generateOutline(
  articleId: string,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db,
  input: GenerateWithPromptInput = {}
): Promise<OutlineVersion> {
  const parsed = generateWithPromptInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  if (!article.selectedAngleId) {
    throw new Error("请先选择一个角度");
  }
  const angle = db.select().from(angleCandidates).where(eq(angleCandidates.id, article.selectedAngleId)).get();
  if (!angle) {
    throw new Error("选中的角度不存在");
  }
  const stagePrompt = getStagePromptDefault("outline", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "outline", db);
  const prompt = buildLayeredPrompt(
    renderPrompt("generate_outline", {
      topic: article.topic,
      angleTitle: angle.angleTitle,
      readerPain: angle.readerPain,
      promise: angle.promise
    }),
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
        status: "success"
      });
      outline = { ...outline, sourceInvocationId: invocationId };
      db.insert(outlineVersions).values(outline).run();
      transitionArticle(db, article, "outline_generated", "generate_outline", { outlineId: outline.id });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return outline;
  } catch (error) {
    recordAIInvocation(db, {
      article,
      taskType: "generate_outline",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI 生成提纲失败"
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

export async function generateDraft(
  articleId: string,
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db,
  input: GenerateWithPromptInput = {}
): Promise<DraftVersion> {
  const parsed = generateWithPromptInputSchema.parse(input);
  const article = requireArticle(articleId, db);
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
    renderPrompt("generate_draft", {
      topic: article.topic,
      mainline: outline.mainline,
      outlineMarkdown: outline.outlineMarkdown
    }),
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
        status: "success"
      });
      draft = { ...draft, sourceInvocationId: invocationId };
      db.insert(draftVersions).values(draft).run();
      transitionArticle(db, article, "draft_generated", "generate_draft", { draftId: draft.id });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
    });

    return draft;
  } catch (error) {
    recordAIInvocation(db, {
      article,
      taskType: "generate_draft",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI 生成文案失败"
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
    recordAIInvocation(db, {
      article,
      taskType: "dbs_content",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "dbs-content 诊断失败"
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
    recordAIInvocation(db, {
      article,
      taskType: "revise_from_diagnosis",
      client,
      prompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "生成修改稿失败"
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

  db.transaction(() => {
    const nextStatus: ArticleStatus = status === "human_review" ? status : "human_review";
    const updatedAt = new Date().toISOString();
    db.update(draftVersions).set({ isFinal: false }).where(eq(draftVersions.articleId, article.id)).run();
    db.update(draftVersions).set({ isFinal: true }).where(eq(draftVersions.id, draft.id)).run();
    db.update(articleProjects)
      .set({ finalDraftVersionId: draft.id, status: nextStatus, updatedAt })
      .where(eq(articleProjects.id, article.id))
      .run();
    recordWorkflowEvent(db, article, status, nextStatus, "mark_final_draft", { draftVersionId: draft.id });
  });

  return { ...draft, isFinal: true };
}

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
    recordAIInvocation(db, {
      article,
      taskType: "pre_publish_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "生成发布前检查摘要失败"
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
    recordAIInvocation(db, {
      article,
      taskType: "review_check",
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "生成复盘检查清单失败"
    });
    throw error;
  }
}

export function listPublishQueueArticles(db: WorkbenchDatabase = getDatabase().db): ArticleListItem[] {
  return listArticles({ publishQueueOnly: true }, db).filter((article) => isPublishQueueStatus(article.status as ArticleStatus));
}

export function updateArticle(
  id: string,
  input: Partial<Pick<ArticleProject, "topic" | "targetReader" | "coreProblem" | "hotAnchor">>,
  db: WorkbenchDatabase = getDatabase().db
): ArticleProject | null {
  const existing = getArticle(id, db);
  if (!existing) {
    return null;
  }
  const values = {
    topic: input.topic ?? existing.topic,
    title: input.topic ? titleFromTopic(input.topic) : existing.title,
    targetReader: input.targetReader ?? existing.targetReader,
    coreProblem: input.coreProblem ?? existing.coreProblem,
    hotAnchor: input.hotAnchor ?? existing.hotAnchor,
    updatedAt: new Date().toISOString()
  };
  db.update(articleProjects).set(values).where(eq(articleProjects.id, id)).run();
  return db.select().from(articleProjects).where(eq(articleProjects.id, id)).get() ?? null;
}

export function ensureAppDataReady(): void {
  ensureDatabaseReady();
}
