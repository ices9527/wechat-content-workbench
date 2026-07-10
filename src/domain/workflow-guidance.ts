import type { QualityGateReworkItem } from "./quality-gate-rework";
import type { QualityGateStage } from "./quality-gates";
import {
  DOMAIN_STAGES,
  getWorkflowStage,
  listDownstreamStages,
  type DomainStage,
  type StageRunStatus,
  type WorkspaceId
} from "./workflow-stages";

export type WorkflowAttentionStage = {
  stage: DomainStage;
  status: Extract<StageRunStatus, "needs_input" | "revise" | "stale">;
  reason: string | null;
  invalidatedByStage: DomainStage | null;
};

export type WorkflowGuidance = {
  kind: "quality_rework" | "stage_attention" | "continue";
  blocking: boolean;
  targetStage: DomainStage | null;
  targetWorkspace: WorkspaceId | null;
  targetTab: string | null;
  reason: string;
  suggestedAction: string;
  affectedStages: DomainStage[];
  sourceId: string | null;
};

const QUALITY_STAGE_TO_DOMAIN_STAGE: Record<Exclude<QualityGateStage, "local">, DomainStage> = {
  topic: "topic",
  angle: "angle",
  research: "research",
  outline: "outline",
  draft: "draft",
  illustration_plan: "illustration",
  pre_publish: "publish"
};

function stageIndex(stage: DomainStage): number {
  return DOMAIN_STAGES.indexOf(stage);
}

function targetDomainStage(item: QualityGateReworkItem): DomainStage {
  const target = item.targetStage === "local" ? item.sourceStage : item.targetStage;
  return target === "local" ? "topic" : QUALITY_STAGE_TO_DOMAIN_STAGE[target];
}

function stageTarget(stage: DomainStage) {
  const definition = getWorkflowStage(stage);
  return {
    targetStage: stage,
    targetWorkspace: definition.workspace,
    targetTab: definition.legacyTabs[0] || null
  };
}

function isBlockingRework(item: QualityGateReworkItem): boolean {
  return item.sourceVerdict === "hold" || item.sourceVerdict === "drop" || item.blockingLevel === "block";
}

export function buildWorkflowGuidance(input: {
  attentionStages: WorkflowAttentionStage[];
  reworkItems: QualityGateReworkItem[];
}): WorkflowGuidance {
  const reworkItems = [...input.reworkItems].sort((left, right) => stageIndex(targetDomainStage(left)) - stageIndex(targetDomainStage(right)));
  const blockingRework = reworkItems.find(isBlockingRework);
  if (blockingRework) {
    const targetStage = targetDomainStage(blockingRework);
    return {
      kind: "quality_rework",
      blocking: true,
      ...stageTarget(targetStage),
      reason: blockingRework.reason,
      suggestedAction: blockingRework.suggestedAction,
      affectedStages: [targetStage, ...listDownstreamStages(targetStage)],
      sourceId: blockingRework.sourceId
    };
  }

  const attention = [...input.attentionStages].sort((left, right) => stageIndex(left.stage) - stageIndex(right.stage))[0];
  if (attention) {
    const label = getWorkflowStage(attention.stage).label;
    const reason =
      attention.reason ||
      (attention.status === "stale" ? `${label}的上游已变化。` : `${label}尚需确认或修改。`);
    const suggestedAction =
      attention.status === "stale"
        ? `从${label}开始重新执行，然后再更新后续受影响节点。`
        : `进入${label}处理当前待确认或待修改内容。`;
    return {
      kind: "stage_attention",
      blocking: true,
      ...stageTarget(attention.stage),
      reason,
      suggestedAction,
      affectedStages: [attention.stage, ...listDownstreamStages(attention.stage)],
      sourceId: null
    };
  }

  const nonBlockingRework = reworkItems[0];
  if (nonBlockingRework) {
    const targetStage = targetDomainStage(nonBlockingRework);
    return {
      kind: "quality_rework",
      blocking: false,
      ...stageTarget(targetStage),
      reason: nonBlockingRework.reason,
      suggestedAction: nonBlockingRework.suggestedAction,
      affectedStages: [targetStage, ...listDownstreamStages(targetStage)],
      sourceId: nonBlockingRework.sourceId
    };
  }

  return {
    kind: "continue",
    blocking: false,
    targetStage: null,
    targetWorkspace: null,
    targetTab: null,
    reason: "当前没有需要返工或确认的阶段。",
    suggestedAction: "继续当前工作流。",
    affectedStages: [],
    sourceId: null
  };
}
