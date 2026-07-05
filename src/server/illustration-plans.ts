import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ArticleStatus } from "@/domain/status";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  aiInvocationRequirements,
  aiInvocations,
  draftVersions,
  illustrationPlans,
  outlineVersions,
  workflowEvents,
  type ArticleProject,
  type DraftVersion,
  type IllustrationPlan,
  type RequirementPreset,
  type StagePromptDefault
} from "@/db/schema";

import type { AIClient, GeneratedIllustrationPlan, GeneratedIllustrationPlanItem } from "./ai";
import { getAIClient } from "./ai";
import { requireArticle, requireDraft } from "./article-records";
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from "./prompt-limits";
import { buildLayeredPrompt, renderPrompt } from "./prompts";
import { resolveSelectedRequirements } from "./requirements";
import { getStagePromptDefault } from "./stage-prompts";
import { getLatestTopicDiagnosisContext, toUpstreamContextSnapshot, type UpstreamContextSnapshot } from "./topic-diagnosis-context";

const promptControlInputShape = {
  customInstruction: z
    .string()
    .trim()
    .max(CUSTOM_INSTRUCTION_MAX_LENGTH, `本次提示词不能超过 ${CUSTOM_INSTRUCTION_MAX_LENGTH} 字`)
    .optional()
    .transform((value) => value || undefined),
  selectedRequirementIds: z.array(z.string().trim().min(1, "可选提示词 ID 不能为空")).optional().default([])
};

const illustrationPlanItemSchema = z.object({
  itemId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || randomUUID()),
  position: z.string().trim().min(1, "插入位置不能为空"),
  purpose: z.string().trim().min(1, "图片作用不能为空"),
  imageType: z.string().trim().min(1, "图片类型不能为空"),
  visualBrief: z.string().trim().min(1, "画面说明不能为空"),
  promptBrief: z.string().trim().min(1, "Prompt 简报不能为空"),
  doNotVisualize: z.string().trim().optional().default(""),
  riskNotes: z.string().trim().optional().default("")
});

export const generateIllustrationPlanInputSchema = z.object(promptControlInputShape);

export const updateIllustrationPlanInputSchema = z.object({
  planId: z.string().trim().min(1, "必须指定配图规划"),
  summaryMarkdown: z.string().trim().min(1, "规划摘要不能为空"),
  items: z.array(illustrationPlanItemSchema).min(1, "至少保留一张配图规划")
});

export const confirmIllustrationPlanInputSchema = z.object({
  planId: z.string().trim().min(1, "必须指定配图规划")
});

export type GenerateIllustrationPlanInput = z.input<typeof generateIllustrationPlanInputSchema>;
export type UpdateIllustrationPlanInput = z.input<typeof updateIllustrationPlanInputSchema>;
export type ConfirmIllustrationPlanInput = z.input<typeof confirmIllustrationPlanInputSchema>;
export type IllustrationPlanItem = z.infer<typeof illustrationPlanItemSchema>;

export type IllustrationPlanPayload = {
  items: IllustrationPlanItem[];
};

function recordWorkflowEvent(
  db: WorkbenchDatabase,
  article: ArticleProject,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  const status = article.status as ArticleStatus;
  db.insert(workflowEvents)
    .values({
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      eventType,
      fromStatus: status,
      toStatus: status,
      payloadJson: JSON.stringify(payload)
    })
    .run();
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

function recordFailedAIInvocation(
  db: WorkbenchDatabase,
  input: {
    article: ArticleProject;
    client: Pick<AIClient, "model" | "baseUrl">;
    prompt: string;
    customInstruction?: string | null;
    stagePrompt?: Pick<StagePromptDefault, "label" | "prompt" | "enabled"> | null;
    upstreamContext?: UpstreamContextSnapshot | null;
    error: unknown;
  }
): string {
  return recordAIInvocation(db, {
    article: input.article,
    taskType: "illustration_plan",
    client: input.client,
    prompt: input.prompt,
    customInstruction: input.customInstruction,
    stagePrompt: input.stagePrompt,
    upstreamContext: input.upstreamContext,
    status: "failed",
    errorMessage: input.error instanceof Error ? input.error.message : "配图规划生成失败"
  });
}

function recordAIInvocationRequirements(db: WorkbenchDatabase, aiInvocationId: string, requirements: RequirementPreset[]): void {
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

function getFinalDraftMainline(draft: DraftVersion, db: WorkbenchDatabase): string {
  if (draft.sourceOutlineId) {
    const outline = db.select().from(outlineVersions).where(eq(outlineVersions.id, draft.sourceOutlineId)).get();
    if (outline) {
      return outline.mainline;
    }
  }
  const acceptedOutline = db
    .select()
    .from(outlineVersions)
    .where(and(eq(outlineVersions.articleId, draft.articleId), eq(outlineVersions.accepted, true)))
    .orderBy(desc(outlineVersions.versionNo))
    .get();
  return acceptedOutline?.mainline || "";
}

function buildSelectedRequirementSummary(requirements: RequirementPreset[]): string {
  if (requirements.length === 0) {
    return "";
  }
  return requirements.map((requirement) => `${requirement.label}：${requirement.promptFragment}`).join("\n");
}

function buildComplianceBoundaries(): string {
  return [
    "- 不承诺收益、身份、开户、审批、到账或其他确定结果。",
    "- 不暗示绕开监管、规避规则或把金融工具作为灰色路径。",
    "- 不把支付、账户、保险、身份或资金工具画成无条件可用的确定通道。",
    "- 涉及家庭资金安排时，画面必须保留用途、条件、额度、身份或合规责任边界。"
  ].join("\n");
}

function toPlanItems(items: GeneratedIllustrationPlanItem[]): IllustrationPlanItem[] {
  return items.map((item, index) => ({
    itemId: `item-${index + 1}`,
    position: item.position,
    purpose: item.purpose,
    imageType: item.imageType,
    visualBrief: item.visualBrief,
    promptBrief: item.promptBrief,
    doNotVisualize: item.doNotVisualize,
    riskNotes: item.riskNotes
  }));
}

function buildPlanJson(items: IllustrationPlanItem[]): string {
  return JSON.stringify({ items } satisfies IllustrationPlanPayload);
}

export function parseIllustrationPlanPayload(planJson: string): IllustrationPlanPayload {
  try {
    const parsed = JSON.parse(planJson) as Partial<IllustrationPlanPayload>;
    if (!Array.isArray(parsed.items)) {
      return { items: [] };
    }
    return { items: parsed.items.map((item) => illustrationPlanItemSchema.parse(item)) };
  } catch {
    return { items: [] };
  }
}

export function listIllustrationPlans(articleId: string, db: WorkbenchDatabase = getDatabase().db): IllustrationPlan[] {
  return db
    .select()
    .from(illustrationPlans)
    .where(eq(illustrationPlans.articleId, articleId))
    .orderBy(desc(illustrationPlans.createdAt))
    .all();
}

export function requireIllustrationPlan(articleId: string, planId: string, db: WorkbenchDatabase): IllustrationPlan {
  const plan = db
    .select()
    .from(illustrationPlans)
    .where(and(eq(illustrationPlans.id, planId), eq(illustrationPlans.articleId, articleId)))
    .get();
  if (!plan) {
    throw new Error("配图规划不存在");
  }
  return plan;
}

export async function generateIllustrationPlan(
  articleId: string,
  input: GenerateIllustrationPlanInput = {},
  client: AIClient = getAIClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<IllustrationPlan> {
  const parsed = generateIllustrationPlanInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const finalDraft = requireFinalDraft(article, db);
  const stagePrompt = getStagePromptDefault("illustration_plan", db);
  const selectedRequirements = resolveSelectedRequirements(parsed.selectedRequirementIds, "illustration_plan", db);
  const selectedRequirementsSummary = buildSelectedRequirementSummary(selectedRequirements);
  const topicDiagnosisContext = getLatestTopicDiagnosisContext(article.id, db);
  const upstreamContext = toUpstreamContextSnapshot(topicDiagnosisContext);
  const prompt = buildLayeredPrompt(
    renderPrompt("illustration_plan", {
      title: article.title,
      targetReader: article.targetReader,
      coreProblem: article.coreProblem,
      mainline: getFinalDraftMainline(finalDraft, db),
      complianceBoundaries: buildComplianceBoundaries(),
      customInstruction: parsed.customInstruction,
      selectedRequirementsSummary,
      finalMarkdown: finalDraft.markdown
    }),
    {
      stageDefaultPrompt: stagePrompt?.enabled ? stagePrompt.prompt : null,
      selectedRequirements
    }
  );

  try {
    const generated: GeneratedIllustrationPlan = await client.generateIllustrationPlan(prompt);
    const items = toPlanItems(generated.items);
    if (items.length === 0) {
      throw new Error("AI 返回的配图规划为空");
    }
    const now = new Date().toISOString();
    let plan: IllustrationPlan = {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      finalDraftVersionId: finalDraft.id,
      sourceInvocationId: null,
      status: "draft",
      planJson: buildPlanJson(items),
      summaryMarkdown: generated.summary,
      createdBy: "ai",
      createdAt: now,
      updatedAt: now
    };

    db.transaction(() => {
      const invocationId = recordAIInvocation(db, {
        article,
        taskType: "illustration_plan",
        client,
        prompt,
        response: generated,
        customInstruction: parsed.customInstruction,
        stagePrompt,
        upstreamContext,
        status: "success"
      });
      recordAIInvocationRequirements(db, invocationId, selectedRequirements);
      plan = { ...plan, sourceInvocationId: invocationId };
      db.insert(illustrationPlans).values(plan).run();
      recordWorkflowEvent(db, article, "generate_illustration_plan", {
        planId: plan.id,
        finalDraftVersionId: finalDraft.id,
        itemCount: items.length
      });
    });

    return plan;
  } catch (error) {
    recordFailedAIInvocation(db, {
      article,
      client,
      prompt,
      customInstruction: parsed.customInstruction,
      stagePrompt,
      upstreamContext,
      error
    });
    throw error;
  }
}

export function updateIllustrationPlan(
  articleId: string,
  input: UpdateIllustrationPlanInput,
  db: WorkbenchDatabase = getDatabase().db
): IllustrationPlan {
  const article = requireArticle(articleId, db);
  const parsed = updateIllustrationPlanInputSchema.parse(input);
  const plan = requireIllustrationPlan(article.id, parsed.planId, db);
  if (plan.status !== "draft") {
    throw new Error("已确认的配图规划不能编辑");
  }
  const now = new Date().toISOString();
  const updated = {
    planJson: buildPlanJson(parsed.items),
    summaryMarkdown: parsed.summaryMarkdown,
    updatedAt: now
  };

  db.transaction(() => {
    db.update(illustrationPlans).set(updated).where(eq(illustrationPlans.id, plan.id)).run();
    recordWorkflowEvent(db, article, "update_illustration_plan", {
      planId: plan.id,
      itemCount: parsed.items.length
    });
  });

  return { ...plan, ...updated };
}

export function confirmIllustrationPlan(
  articleId: string,
  input: ConfirmIllustrationPlanInput,
  db: WorkbenchDatabase = getDatabase().db
): IllustrationPlan {
  const article = requireArticle(articleId, db);
  const parsed = confirmIllustrationPlanInputSchema.parse(input);
  const plan = requireIllustrationPlan(article.id, parsed.planId, db);
  const now = new Date().toISOString();

  db.transaction(() => {
    for (const current of listIllustrationPlans(article.id, db)) {
      if (current.id !== plan.id && current.status !== "superseded") {
        db.update(illustrationPlans).set({ status: "superseded", updatedAt: now }).where(eq(illustrationPlans.id, current.id)).run();
      }
    }
    db.update(illustrationPlans).set({ status: "confirmed", updatedAt: now }).where(eq(illustrationPlans.id, plan.id)).run();
    recordWorkflowEvent(db, article, "confirm_illustration_plan", {
      planId: plan.id,
      finalDraftVersionId: plan.finalDraftVersionId
    });
  });

  return { ...plan, status: "confirmed", updatedAt: now };
}
