import { and, asc, desc, eq } from "drizzle-orm";

import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  aiInvocationRequirements,
  aiInvocations,
  type AIInvocation,
  type AIInvocationRequirement,
  type DraftVersion
} from "@/db/schema";

import { requireArticle, requireDraft, requireOutline, requireResearchVersion, requireTopicDiagnosis } from "./article-records";
import { type TopicDiagnosisContext, type UpstreamContextSnapshot } from "./topic-diagnosis-context";

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
  upstreamTopicDiagnosis: TopicDiagnosisContext | null;
  selectedRequirements: PromptRecipeRequirement[];
  customInstruction: string | null;
  finalPrompt: string | null;
  emptyReason?: string;
};

export function listRequirementSnapshotsForInvocation(
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

export function findRequirementSnapshotsForDraft(
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
    upstreamTopicDiagnosis: null,
    selectedRequirements: [],
    customInstruction: null,
    finalPrompt: null,
    emptyReason: reason
  };
}

function parseUpstreamTopicDiagnosis(upstreamContextJson: string | null): TopicDiagnosisContext | null {
  if (!upstreamContextJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(upstreamContextJson) as UpstreamContextSnapshot;
    return parsed.topicDiagnosis || null;
  } catch {
    return null;
  }
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
    upstreamTopicDiagnosis: parseUpstreamTopicDiagnosis(invocation.upstreamContextJson),
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

export function getPromptRecipeForTopicDiagnosis(
  articleId: string,
  topicDiagnosisId: string,
  db: WorkbenchDatabase = getDatabase().db
): PromptRecipe {
  const article = requireArticle(articleId, db);
  const diagnosis = requireTopicDiagnosis(article.id, topicDiagnosisId, db);
  if (!diagnosis.sourceInvocationId) {
    return emptyPromptRecipe(article.id, "这个选题诊断没有绑定 AI 提示词记录，可能是旧版本数据。");
  }
  return requireInvocationRecipe(article.id, diagnosis.sourceInvocationId, db);
}

export function getPromptRecipeForResearch(
  articleId: string,
  researchVersionId: string,
  db: WorkbenchDatabase = getDatabase().db
): PromptRecipe {
  const article = requireArticle(articleId, db);
  const research = requireResearchVersion(article.id, researchVersionId, db);
  if (!research.sourceInvocationId) {
    return emptyPromptRecipe(article.id, "这个研究资料包没有绑定 AI 提示词记录，可能是人工保存或旧版本数据。");
  }
  return requireInvocationRecipe(article.id, research.sourceInvocationId, db);
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
