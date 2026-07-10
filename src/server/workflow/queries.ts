import { and, desc, eq, inArray } from "drizzle-orm";

import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  aiInvocations,
  aiStyleChecks,
  angleCandidates,
  articleProjects,
  draftVersions,
  outlineVersions,
  promptRunArtifacts,
  researchVersions,
  topicDiagnoses,
  topicVersions,
  type AIStyleCheck,
  type AngleCandidate,
  type ArticleProject,
  type DraftVersion,
  type OutlineVersion,
  type PromptRunArtifact,
  type ResearchVersion,
  type TopicDiagnosis,
  type TopicVersion
} from "@/db/schema";
import {
  buildQualityGateReworkItems,
  type QualityGateReworkItem,
  type QualityGateReworkSource
} from "@/domain/quality-gate-rework";
import type { QualityGateResult, QualityGateStage } from "@/domain/quality-gates";
import { stageContractPayloadSchema } from "@/domain/stage-contracts";
import { getNextAction, getStatusLabel, isPublishQueueStatus, type ArticleStatus } from "@/domain/status";
import type { RequirementStage } from "@/domain/stages";
import { buildWorkflowGuidance, type WorkflowAttentionStage, type WorkflowGuidance } from "@/domain/workflow-guidance";
import { DOMAIN_STAGES, type DomainStage } from "@/domain/workflow-stages";

import { requireArticle } from "../article-records";
import { extractQualityGateResultFromResponse } from "../quality-gate-results";
import { getStageContractForRun, listLatestStageRuns } from "../stage-runs";

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

function formatTopicDiagnosisVerdict(verdict: string): string {
  return TOPIC_DIAGNOSIS_FILTER_LABELS[verdict as Exclude<TopicDiagnosisFilter, "missing">] || verdict;
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

function qualityGateSourceFromInvocation(
  input: {
    id: string;
    label: string;
    sourceInvocationId: string | null;
    expectedStage: QualityGateStage;
  },
  db: WorkbenchDatabase
): QualityGateReworkSource {
  if (!input.sourceInvocationId) {
    return { id: input.id, label: input.label, result: null };
  }
  const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, input.sourceInvocationId)).get();
  return {
    id: input.id,
    label: input.label,
    result: extractQualityGateResultFromResponse(invocation?.response || null, input.expectedStage)
  };
}

export function listQualityGateReworkItems(
  articleId: string,
  db: WorkbenchDatabase = getDatabase().db
): QualityGateReworkItem[] {
  const article = requireArticle(articleId, db);
  const sources: QualityGateReworkSource[] = [];
  const latestTopicDiagnosis = listTopicDiagnoses(article.id, db)[0] || null;
  const outlines = listOutlines(article.id, db);
  const selectedOutline = outlines.find((outline) => outline.accepted) || outlines[0] || null;
  const drafts = listDrafts(article.id, db);
  const latestDraft = drafts[0] || null;
  const aiStyleChecksForArticle = listAIStyleChecks(article.id, db);
  const latestDraftAIStyleCheck = latestDraft
    ? aiStyleChecksForArticle.find((check) => check.draftVersionId === latestDraft.id && check.sourceType === "draft_version") || null
    : null;
  const currentRuns = new Map(listLatestStageRuns(article.id, db).map((run) => [run.stage, run]));
  const contractBackedStages = new Set<"topic" | "outline" | "draft">();

  for (const config of [
    { stage: "topic" as const, label: "选题诊断" },
    { stage: "outline" as const, label: selectedOutline ? `主线提纲 v${selectedOutline.versionNo}` : "主线提纲" },
    {
      stage: "draft" as const,
      label: latestDraft ? `Markdown 文案 v${latestDraft.versionNo}` : "Markdown 文案"
    }
  ]) {
    const run = currentRuns.get(config.stage);
    if (!run || ["stale", "failed", "pending", "running", "needs_input"].includes(run.status)) {
      continue;
    }
    const contract = getStageContractForRun(article.id, run.id, db);
    if (!contract) {
      continue;
    }
    contractBackedStages.add(config.stage);
    const parsed = stageContractPayloadSchema.safeParse(JSON.parse(contract.contractJson));
    sources.push({
      id: `stage-contract:${contract.id}`,
      label: config.label,
      result: parsed.success ? (parsed.data.qualityGate as QualityGateResult | null) : null
    });
  }

  if (latestTopicDiagnosis && !contractBackedStages.has("topic")) {
    sources.push(
      qualityGateSourceFromInvocation(
        {
          id: `topic-diagnosis:${latestTopicDiagnosis.id}`,
          label: "选题诊断",
          sourceInvocationId: latestTopicDiagnosis.sourceInvocationId,
          expectedStage: "topic"
        },
        db
      )
    );
  }
  if (selectedOutline && !contractBackedStages.has("outline")) {
    sources.push(
      qualityGateSourceFromInvocation(
        {
          id: `outline:${selectedOutline.id}`,
          label: `主线提纲 v${selectedOutline.versionNo}`,
          sourceInvocationId: selectedOutline.sourceInvocationId,
          expectedStage: "outline"
        },
        db
      )
    );
  }
  if (latestDraft && !contractBackedStages.has("draft")) {
    sources.push(
      qualityGateSourceFromInvocation(
        {
          id: `draft:${latestDraft.id}`,
          label: `Markdown 文案 v${latestDraft.versionNo}`,
          sourceInvocationId: latestDraft.sourceInvocationId,
          expectedStage: "draft"
        },
        db
      )
    );
  }
  if (latestDraftAIStyleCheck && !contractBackedStages.has("draft")) {
    sources.push(
      qualityGateSourceFromInvocation(
        {
          id: `ai-style-check:${latestDraftAIStyleCheck.id}`,
          label: "文案清洁检查",
          sourceInvocationId: latestDraftAIStyleCheck.sourceInvocationId,
          expectedStage: "draft"
        },
        db
      )
    );
  }

  return buildQualityGateReworkItems(sources);
}

export function getArticleWorkflowGuidance(
  articleId: string,
  db: WorkbenchDatabase = getDatabase().db
): WorkflowGuidance {
  requireArticle(articleId, db);
  const attentionStages = listLatestStageRuns(articleId, db).flatMap((run): WorkflowAttentionStage[] => {
    if (!DOMAIN_STAGES.includes(run.stage as DomainStage) || !["needs_input", "revise", "stale"].includes(run.status)) {
      return [];
    }
    const contract = getStageContractForRun(articleId, run.id, db);
    let contractDecision: string | null = null;
    if (contract) {
      const parsed = stageContractPayloadSchema.safeParse(JSON.parse(contract.contractJson));
      contractDecision = parsed.success ? parsed.data.decision : null;
    }
    return [
      {
        stage: run.stage as DomainStage,
        status: run.status as WorkflowAttentionStage["status"],
        reason: run.invalidationReason || contractDecision,
        invalidatedByStage: DOMAIN_STAGES.includes(run.invalidatedByStage as DomainStage)
          ? (run.invalidatedByStage as DomainStage)
          : null
      }
    ];
  });
  return buildWorkflowGuidance({
    attentionStages,
    reworkItems: listQualityGateReworkItems(articleId, db)
  });
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

export function listPublishQueueArticles(db: WorkbenchDatabase = getDatabase().db): ArticleListItem[] {
  return listArticles({ publishQueueOnly: true }, db).filter((article) => isPublishQueueStatus(article.status as ArticleStatus));
}
