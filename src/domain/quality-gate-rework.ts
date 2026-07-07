import { getQualityCheck, type QualityBlockingLevel, type QualityGateResult, type QualityGateStage } from "./quality-gates";

export type QualityGateReworkTabId =
  | "topic"
  | "topic-diagnosis"
  | "angles"
  | "research"
  | "outline"
  | "draft"
  | "final"
  | "illustration"
  | "publish"
  | "review";

export type QualityGateReworkSource = {
  id: string;
  label: string;
  result: QualityGateResult | null;
};

export type QualityGateReworkItem = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceStage: QualityGateStage;
  sourceVerdict: QualityGateResult["verdict"];
  targetStage: QualityGateStage;
  targetTab: QualityGateReworkTabId;
  targetLabel: string;
  checkId: string;
  checkLabel: string;
  blockingLevel: QualityBlockingLevel | "unknown";
  reason: string;
  suggestedAction: string;
  sourceSummary: string;
};

export const QUALITY_GATE_REWORK_STAGE_LABELS: Record<QualityGateStage, string> = {
  local: "当前节点",
  topic: "主题",
  angle: "角度",
  research: "内容研究",
  outline: "主线提纲",
  draft: "Markdown 文案",
  illustration_plan: "配图规划",
  pre_publish: "发布"
};

export const QUALITY_GATE_REWORK_STAGE_TABS: Record<QualityGateStage, QualityGateReworkTabId> = {
  local: "topic",
  topic: "topic",
  angle: "angles",
  research: "research",
  outline: "outline",
  draft: "draft",
  illustration_plan: "illustration",
  pre_publish: "publish"
};

export function qualityGateStageToReworkTab(stage: QualityGateStage): QualityGateReworkTabId {
  return QUALITY_GATE_REWORK_STAGE_TABS[stage];
}

export function qualityGateStageToReworkLabel(stage: QualityGateStage): string {
  return QUALITY_GATE_REWORK_STAGE_LABELS[stage];
}

export function buildQualityGateReworkItems(sources: QualityGateReworkSource[]): QualityGateReworkItem[] {
  const items: QualityGateReworkItem[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source.result || source.result.upstreamRework.length === 0) {
      continue;
    }

    for (const rework of source.result.upstreamRework) {
      const check = getQualityCheck(rework.checkId);
      const id = `${source.id}:${rework.targetStage}:${rework.checkId}:${rework.reason}:${rework.suggestedAction}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      items.push({
        id,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceStage: source.result.stage,
        sourceVerdict: source.result.verdict,
        targetStage: rework.targetStage,
        targetTab: qualityGateStageToReworkTab(rework.targetStage),
        targetLabel: qualityGateStageToReworkLabel(rework.targetStage),
        checkId: rework.checkId,
        checkLabel: check?.label || rework.checkId,
        blockingLevel: check?.blockingLevel || "unknown",
        reason: rework.reason,
        suggestedAction: rework.suggestedAction,
        sourceSummary: source.result.summaryForDownstream
      });
    }
  }

  return items;
}

export function shouldBlockContinuationForQualityGate(result: QualityGateResult | null | undefined): boolean {
  if (!result) {
    return false;
  }
  if (result.verdict === "hold" || result.verdict === "drop") {
    return true;
  }
  return result.upstreamRework.some((rework) => getQualityCheck(rework.checkId)?.blockingLevel === "block");
}
