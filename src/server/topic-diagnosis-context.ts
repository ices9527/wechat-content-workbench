import { desc, eq } from "drizzle-orm";

import { type WorkbenchDatabase } from "@/db/client";
import { topicDiagnoses } from "@/db/schema";

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
  topicSnapshot: string;
  targetReaderSnapshot: string | null;
  coreProblemSnapshot: string | null;
  hotAnchorSnapshot: string | null;
  customInstructionSnapshot: string | null;
  createdAt: string;
};

export type UpstreamContextSnapshot = {
  topicDiagnosis: TopicDiagnosisContext | null;
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
    topicSnapshot: diagnosis.topicSnapshot,
    targetReaderSnapshot: diagnosis.targetReaderSnapshot,
    coreProblemSnapshot: diagnosis.coreProblemSnapshot,
    hotAnchorSnapshot: diagnosis.hotAnchorSnapshot,
    customInstructionSnapshot: diagnosis.customInstructionSnapshot,
    createdAt: diagnosis.createdAt
  };
}

export function isBlockingTopicDiagnosis(context: TopicDiagnosisContext | null): boolean {
  return context?.verdict === "hold" || context?.verdict === "drop";
}

export function assertTopicDiagnosisAllowsAngleFlow(context: TopicDiagnosisContext | null): void {
  if (!isBlockingTopicDiagnosis(context)) {
    return;
  }

  const label = context?.verdict === "drop" ? "放弃" : "暂缓";
  throw new Error(`最新选题诊断结论为“${label}”，请修改主题或重新运行选题诊断后继续。`);
}

export const assertTopicDiagnosisAllowsDownstreamFlow = assertTopicDiagnosisAllowsAngleFlow;

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

  const stageInstruction = {
    angle: "生成角度时必须承接诊断中的真实读者、真实问题和点开理由；如果结论为 revise，要优先补强诊断指出的薄弱处。",
    content_research: "生成内容研究资料包时必须承接诊断中的真实问题和主要风险，只整理事实、边界、读者问题和可写方向，不写正文或提纲。",
    outline: "生成主线和提纲时必须回应诊断中的真实问题，处理主要风险，不要绕开诊断中的边界。",
    draft: "生成文案时必须承接诊断中的目标读者和真实问题，处理主要风险，不要写成诊断中已经提示的错误方向。"
  }[stage];

  return [
    "## 上游选题诊断快照",
    `诊断结论：${context.verdict}`,
    `主题快照：${context.topicSnapshot}`,
    `目标读者快照：${context.targetReaderSnapshot || "未填写"}`,
    `核心问题快照：${context.coreProblemSnapshot || "未填写"}`,
    `热点锚点快照：${context.hotAnchorSnapshot || "未填写"}`,
    `目标读者判断：${context.targetReaderCheck || "未填写"}`,
    `读者问题判断：${context.readerProblemCheck || "未填写"}`,
    `点击理由判断：${context.timelinessCheck || "未填写"}`,
    `行动边界判断：${context.actionabilityCheck || "未填写"}`,
    `主要风险：${context.riskSummary || "未填写"}`,
    `修改建议：${context.suggestionsMarkdown || "未填写"}`,
    `下一步建议：${context.nextAction || "未填写"}`,
    `本阶段约束：${stageInstruction}`
  ].join("\n");
}
