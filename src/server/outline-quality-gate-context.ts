import { eq } from "drizzle-orm";

import { type WorkbenchDatabase } from "@/db/client";
import { aiInvocations, type OutlineVersion } from "@/db/schema";
import type { QualityGateResult } from "@/domain/quality-gates";

import { extractQualityGateResultFromResponse } from "./quality-gate-results";

export type OutlineQualityGateContext = {
  outlineVersionId: string;
  mainline: string;
  qualityGate: QualityGateResult;
};

function formatQualityGateVerdict(verdict: QualityGateResult["verdict"]): string {
  const labels: Record<QualityGateResult["verdict"], string> = {
    pass: "通过",
    revise: "修改",
    hold: "暂缓",
    drop: "放弃"
  };
  return labels[verdict];
}

export function getOutlineQualityGateContext(outline: Pick<OutlineVersion, "id" | "mainline" | "sourceInvocationId">, db: WorkbenchDatabase): OutlineQualityGateContext | null {
  if (!outline.sourceInvocationId) {
    return null;
  }

  const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, outline.sourceInvocationId)).get();
  const qualityGate = extractQualityGateResultFromResponse(invocation?.response || null, "outline");
  if (!qualityGate) {
    return null;
  }

  return {
    outlineVersionId: outline.id,
    mainline: outline.mainline,
    qualityGate
  };
}

export function requireOutlineQualityGateContext(outline: Pick<OutlineVersion, "id" | "mainline" | "sourceInvocationId">, db: WorkbenchDatabase): OutlineQualityGateContext {
  const context = getOutlineQualityGateContext(outline, db);
  if (!context) {
    throw new Error("已确认提纲缺少质量门结果，请重新生成主线和提纲后继续。");
  }
  return context;
}

export function assertOutlineQualityGateAllowsDraft(context: OutlineQualityGateContext): void {
  if (context.qualityGate.verdict === "pass") {
    return;
  }
  throw new Error(`主线和提纲质量门结论为“${formatQualityGateVerdict(context.qualityGate.verdict)}”，请先修改主线和提纲后继续生成文案。`);
}

export function formatOutlineQualityGateContextForPrompt(context: OutlineQualityGateContext): string {
  return [
    "## 上游主线提纲质量门",
    `质量门结论：${context.qualityGate.verdict}`,
    `主线快照：${context.mainline}`,
    `下游摘要：${context.qualityGate.summaryForDownstream}`,
    "本阶段约束：生成 Markdown 文案时必须承接主线和提纲质量门摘要，不重新判断选题或主线是否成立。"
  ].join("\n");
}
