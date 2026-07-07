import { eq } from "drizzle-orm";

import { type WorkbenchDatabase } from "@/db/client";
import { aiInvocations, type AIStyleCheck, type DraftVersion } from "@/db/schema";
import type { QualityGateResult } from "@/domain/quality-gates";

import { extractQualityGateResultFromResponse } from "./quality-gate-results";

export type DraftQualityGateContext = {
  sourceType: "draft_version" | "ai_style_check";
  draftVersionId: string;
  versionNo: number | null;
  qualityGate: QualityGateResult;
};

function getDraftQualityGateFromInvocation(sourceInvocationId: string | null, db: WorkbenchDatabase): QualityGateResult | null {
  if (!sourceInvocationId) {
    return null;
  }

  const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, sourceInvocationId)).get();
  return extractQualityGateResultFromResponse(invocation?.response || null, "draft");
}

export function getDraftQualityGateContext(
  draft: Pick<DraftVersion, "id" | "versionNo" | "sourceInvocationId">,
  db: WorkbenchDatabase
): DraftQualityGateContext | null {
  const qualityGate = getDraftQualityGateFromInvocation(draft.sourceInvocationId, db);
  if (!qualityGate) {
    return null;
  }

  return {
    sourceType: "draft_version",
    draftVersionId: draft.id,
    versionNo: draft.versionNo,
    qualityGate
  };
}

export function getAIStyleCheckQualityGateContext(
  check: Pick<AIStyleCheck, "draftVersionId" | "sourceInvocationId">,
  sourceDraft: Pick<DraftVersion, "versionNo"> | null,
  db: WorkbenchDatabase
): DraftQualityGateContext | null {
  const qualityGate = getDraftQualityGateFromInvocation(check.sourceInvocationId, db);
  if (!qualityGate) {
    return null;
  }

  return {
    sourceType: "ai_style_check",
    draftVersionId: check.draftVersionId,
    versionNo: sourceDraft?.versionNo ?? null,
    qualityGate
  };
}

function formatOwnedCheck(check: QualityGateResult["ownedChecks"][number]): string {
  const suggestion = check.suggestion ? `；建议：${check.suggestion}` : "";
  const evidence = check.evidence ? `；证据：${check.evidence}` : "";
  return `- ${check.checkId}：${check.status}${evidence}${suggestion}`;
}

export function formatDraftQualityGateContextForPrompt(context: DraftQualityGateContext): string {
  return [
    "## 文案质量门结果",
    `来源：${context.sourceType}`,
    `文案版本：${context.versionNo ? `v${context.versionNo}` : context.draftVersionId}`,
    `质量门结论：${context.qualityGate.verdict}`,
    `下游摘要：${context.qualityGate.summaryForDownstream}`,
    "检查项结果：",
    ...context.qualityGate.ownedChecks.map(formatOwnedCheck),
    "本阶段约束：生成清洁版文案时必须优先处理文案质量门指出的文字洁癖、表达效率和 AI 痕迹问题，不重新判断选题或主线是否成立。"
  ].join("\n");
}
