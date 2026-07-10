import { desc, eq } from "drizzle-orm";

import { type WorkbenchDatabase } from "@/db/client";
import { aiInvocations, topicDiagnoses, type ArticleProject } from "@/db/schema";
import type { QualityGateResult } from "@/domain/quality-gates";
import type { StageContextSnapshot } from "./stage-context";

import { extractQualityGateResultFromResponse } from "./quality-gate-results";

export type TopicDiagnosisContext = {
  diagnosisId: string;
  verdict: string;
  targetReaderCheck: string | null;
  readerProblemCheck: string | null;
  timelinessCheck: string | null;
  actionabilityCheck: string | null;
  riskSummary: string | null;
  suggestionsMarkdown: string | null;
  nextAction: string | null;
  qualityGate: QualityGateResult | null;
  topicSnapshot: string;
  targetReaderSnapshot: string | null;
  coreProblemSnapshot: string | null;
  hotAnchorSnapshot: string | null;
  customInstructionSnapshot: string | null;
  createdAt: string;
};

export type UpstreamContextSnapshot = {
  topicDiagnosis?: TopicDiagnosisContext | null;
  outlineQualityGate?: unknown;
  draftQualityGate?: unknown;
  stageContext?: StageContextSnapshot;
};

export function getLatestTopicDiagnosisContext(articleId: string, db: WorkbenchDatabase): TopicDiagnosisContext | null {
  const diagnosis = db
    .select()
    .from(topicDiagnoses)
    .where(eq(topicDiagnoses.articleId, articleId))
    .orderBy(desc(topicDiagnoses.createdAt))
    .get();

  if (!diagnosis) {
    return null;
  }
  const invocation = diagnosis.sourceInvocationId
    ? db.select().from(aiInvocations).where(eq(aiInvocations.id, diagnosis.sourceInvocationId)).get()
    : null;

  return {
    diagnosisId: diagnosis.id,
    verdict: diagnosis.verdict,
    targetReaderCheck: diagnosis.targetReaderCheck,
    readerProblemCheck: diagnosis.readerProblemCheck,
    timelinessCheck: diagnosis.timelinessCheck,
    actionabilityCheck: diagnosis.actionabilityCheck,
    riskSummary: diagnosis.riskSummary,
    suggestionsMarkdown: diagnosis.suggestionsMarkdown,
    nextAction: diagnosis.nextAction,
    qualityGate: extractQualityGateResultFromResponse(invocation?.response || null, "topic"),
    topicSnapshot: diagnosis.topicSnapshot,
    targetReaderSnapshot: diagnosis.targetReaderSnapshot,
    coreProblemSnapshot: diagnosis.coreProblemSnapshot,
    hotAnchorSnapshot: diagnosis.hotAnchorSnapshot,
    customInstructionSnapshot: diagnosis.customInstructionSnapshot,
    createdAt: diagnosis.createdAt
  };
}

export function isBlockingTopicDiagnosis(context: TopicDiagnosisContext | null): boolean {
  return context?.qualityGate?.verdict === "hold" || context?.qualityGate?.verdict === "drop";
}

function normalizeSnapshotValue(value: string | null | undefined): string {
  return (value || "").trim();
}

export function isTopicDiagnosisStaleForArticle(
  article: Pick<ArticleProject, "topic" | "targetReader" | "coreProblem" | "hotAnchor">,
  context: TopicDiagnosisContext | null
): boolean {
  if (!context) {
    return false;
  }

  return (
    normalizeSnapshotValue(article.topic) !== normalizeSnapshotValue(context.topicSnapshot) ||
    normalizeSnapshotValue(article.targetReader) !== normalizeSnapshotValue(context.targetReaderSnapshot) ||
    normalizeSnapshotValue(article.coreProblem) !== normalizeSnapshotValue(context.coreProblemSnapshot) ||
    normalizeSnapshotValue(article.hotAnchor) !== normalizeSnapshotValue(context.hotAnchorSnapshot)
  );
}

export function assertTopicDiagnosisAllowsAngleFlow(context: TopicDiagnosisContext | null): void {
  if (context && !context.qualityGate) {
    throw new Error("最新选题诊断缺少质量门结果，请重新运行选题诊断后继续。");
  }
  if (!isBlockingTopicDiagnosis(context)) {
    return;
  }

  const label = context?.qualityGate?.verdict === "drop" ? "放弃" : "暂缓";
  throw new Error(`最新选题诊断结论为“${label}”，请修改主题或重新运行选题诊断后继续。`);
}

export const assertTopicDiagnosisAllowsDownstreamFlow = assertTopicDiagnosisAllowsAngleFlow;

export function assertTopicDiagnosisFreshForArticle(
  article: Pick<ArticleProject, "topic" | "targetReader" | "coreProblem" | "hotAnchor">,
  context: TopicDiagnosisContext | null
): void {
  if (!isTopicDiagnosisStaleForArticle(article, context)) {
    return;
  }

  throw new Error("主题已修改，需要重新运行选题诊断后继续。");
}

export function assertTopicDiagnosisContextAllowsDownstreamFlow(
  article: Pick<ArticleProject, "topic" | "targetReader" | "coreProblem" | "hotAnchor">,
  context: TopicDiagnosisContext | null
): void {
  assertTopicDiagnosisFreshForArticle(article, context);
  assertTopicDiagnosisAllowsDownstreamFlow(context);
}

export function toUpstreamContextSnapshot(context: TopicDiagnosisContext | null): UpstreamContextSnapshot | null {
  return context ? { topicDiagnosis: context } : null;
}

export function formatTopicDiagnosisContextForPrompt(
  context: TopicDiagnosisContext | null,
  stage: "angle" | "content_research" | "outline" | "draft"
): string {
  if (!context) {
    return "";
  }
  if (!context.qualityGate) {
    throw new Error("最新选题诊断缺少质量门结果，请重新运行选题诊断后继续。");
  }

  const stageInstruction = {
    angle: "生成角度时必须承接诊断中的真实读者、真实问题和点开理由；如果结论为 revise，要优先补强诊断指出的薄弱处。",
    content_research: "生成内容研究资料包时必须承接诊断中的真实问题和主要风险，只整理事实、边界、读者问题和可写方向，不写正文或提纲。",
    outline: "生成主线和提纲时必须回应诊断中的真实问题，处理主要风险，不要绕开诊断中的边界。",
    draft: "生成文案时必须承接诊断中的目标读者和真实问题，处理主要风险，不要写成诊断中已经提示的错误方向。"
  }[stage];

  return [
    "## 上游选题诊断质量门",
    `质量门结论：${context.qualityGate.verdict}`,
    `下游摘要：${context.qualityGate.summaryForDownstream}`,
    `主题快照：${context.topicSnapshot}`,
    `目标读者快照：${context.targetReaderSnapshot || "未填写"}`,
    `核心问题快照：${context.coreProblemSnapshot || "未填写"}`,
    `热点锚点快照：${context.hotAnchorSnapshot || "未填写"}`,
    `本阶段约束：${stageInstruction}`
  ].join("\n");
}
