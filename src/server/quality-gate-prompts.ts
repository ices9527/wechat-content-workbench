import {
  QUALITY_CHECK_RESULT_STATUSES,
  QUALITY_GATE_VERDICTS,
  type QualityCheck,
  type QualityCheckId,
  type QualityGateResult,
  type QualityGateStage,
  listQualityChecks
} from "@/domain/quality-gates";

export const QUALITY_GATE_PROMPT_STAGES = ["topic", "outline", "draft"] as const;

export type QualityGatePromptStage = (typeof QUALITY_GATE_PROMPT_STAGES)[number];

const QUALITY_GATE_STAGE_LABELS: Record<QualityGatePromptStage, string> = {
  topic: "主题/选题诊断",
  outline: "主线和提纲",
  draft: "Markdown 文案"
};

const QUALITY_GATE_STAGE_PURPOSES: Record<QualityGatePromptStage, string> = {
  topic: "写之前判断主题是否具备可写前提和选题价值。",
  outline: "判断主线是否有认知落差，以及提纲是否能承载主线。",
  draft: "检查文案表达层问题，不重新判断选题和主线。"
};

export type QualityGatePromptPlan = {
  stage: QualityGatePromptStage;
  label: string;
  purpose: string;
  ownedChecks: QualityCheck[];
  excludedChecks: QualityCheck[];
  resultContract: Pick<QualityGateResult, "stage" | "verdict" | "ownedChecks" | "upstreamRework" | "summaryForDownstream">;
};

function isQualityGatePromptStage(stage: QualityGateStage): stage is QualityGatePromptStage {
  return (QUALITY_GATE_PROMPT_STAGES as readonly QualityGateStage[]).includes(stage);
}

function formatCheck(check: QualityCheck): string {
  return `- ${check.id}｜${check.label}｜owner=${check.ownerStage}｜blocking=${check.blockingLevel}：${check.description}`;
}

function buildResultContract(stage: QualityGatePromptStage): QualityGatePromptPlan["resultContract"] {
  const firstOwnedCheckId = listQualityChecks(stage)[0]?.id as QualityCheckId | undefined;
  return {
    stage,
    verdict: "pass",
    ownedChecks: [
      {
        checkId: firstOwnedCheckId ?? "local.input_completeness",
        status: "pass",
        evidence: null,
        suggestion: null
      }
    ],
    upstreamRework: [],
    summaryForDownstream: "给下游节点读取的一句话摘要。"
  };
}

export function buildQualityGatePromptPlan(stage: QualityGateStage): QualityGatePromptPlan {
  if (!isQualityGatePromptStage(stage)) {
    throw new Error(`Unsupported quality gate prompt stage: ${stage}`);
  }

  return {
    stage,
    label: QUALITY_GATE_STAGE_LABELS[stage],
    purpose: QUALITY_GATE_STAGE_PURPOSES[stage],
    ownedChecks: listQualityChecks(stage),
    excludedChecks: listQualityChecks().filter((check) => check.ownerStage !== stage && check.ownerStage !== "local"),
    resultContract: buildResultContract(stage)
  };
}

export function buildQualityGatePromptSection(stage: QualityGateStage): string {
  const plan = buildQualityGatePromptPlan(stage);
  const ownedIds = plan.ownedChecks.map((check) => check.id).join("、");
  const contractJson = JSON.stringify(plan.resultContract, null, 2);

  return [
    "## 节点质量门",
    `当前节点：${plan.label}`,
    `节点目的：${plan.purpose}`,
    "",
    "### Owned Checks",
    "只完整诊断以下检查项，并且 ownedChecks[].checkId 只能使用这些 ID：",
    ...plan.ownedChecks.map(formatCheck),
    "",
    "### Excluded Checks",
    "不要完整诊断以下检查项。如果发现相关问题，只能在 upstreamRework 中建议回到真实 owner 节点处理：",
    ...plan.excludedChecks.map(formatCheck),
    "",
    "### 输出契约",
    "最终必须输出一个 JSON 对象，根字段只能包含 artifact 和 qualityGate。",
    "artifact 保存本节点产物；如果基础提示词要求输出业务字段，请把这些业务字段放入 artifact。",
    `verdict 只能使用：${QUALITY_GATE_VERDICTS.join("、")}`,
    `ownedChecks[].status 只能使用：${QUALITY_CHECK_RESULT_STATUSES.join("、")}`,
    `ownedChecks[].checkId 只能使用：${ownedIds}`,
    "upstreamRework[].targetStage 必须等于 checkId 的真实 owner stage。",
    "summaryForDownstream 必须是一段可被下游 prompt 直接读取的摘要。",
    "质量门结果必须放在 qualityGate 字段中。",
    "",
    "示例 qualityGate：",
    contractJson
  ].join("\n");
}

export function buildPromptWithQualityGate(basePrompt: string, stage: QualityGateStage): string {
  return [basePrompt.trim(), buildQualityGatePromptSection(stage)].filter(Boolean).join("\n\n");
}
