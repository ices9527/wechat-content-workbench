import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { stageContractPayloadSchema, type StageContractPayload } from "@/domain/stage-contracts";
import { DOMAIN_STAGES, getWorkflowStage, type DomainStage } from "@/domain/workflow-stages";

import { getLatestStageRun, getStageContractForRun } from "./stage-runs";

export type CompiledStageContract = {
  contractId: string;
  stageRunId: string;
  stage: DomainStage;
  versionNo: number;
  sourceArtifactType: string | null;
  sourceArtifactId: string | null;
  sourceInvocationId: string | null;
  payload: StageContractPayload;
};

export type StageContextSnapshot = {
  targetStage: DomainStage;
  contracts: Array<{
    contractId: string;
    stageRunId: string;
    stage: DomainStage;
    versionNo: number;
    sourceArtifactType: string | null;
    sourceArtifactId: string | null;
    sourceInvocationId: string | null;
    payload: StageContractPayload;
  }>;
  missingRequiredStages: DomainStage[];
  missingOptionalStages: DomainStage[];
};

export type CompiledStageContext = {
  targetStage: DomainStage;
  contracts: CompiledStageContract[];
  missingRequiredStages: DomainStage[];
  missingOptionalStages: DomainStage[];
  promptText: string;
  snapshot: StageContextSnapshot;
};

function compileContract(articleId: string, stage: DomainStage, db: WorkbenchDatabase): CompiledStageContract | null {
  const run = getLatestStageRun(articleId, stage, db);
  if (!run || run.status === "stale" || run.status === "failed") {
    return null;
  }
  const record = getStageContractForRun(articleId, run.id, db);
  if (!record) {
    return null;
  }
  const payload = stageContractPayloadSchema.parse(JSON.parse(record.contractJson));
  if (payload.stage !== stage) {
    throw new Error(`StageContract ${record.id} 阶段不匹配：预期 ${stage}，实际 ${payload.stage}`);
  }
  return {
    contractId: record.id,
    stageRunId: run.id,
    stage,
    versionNo: run.versionNo,
    sourceArtifactType: record.sourceArtifactType,
    sourceArtifactId: record.sourceArtifactId,
    sourceInvocationId: record.sourceInvocationId,
    payload
  };
}

function formatContractForPrompt(contract: CompiledStageContract): string {
  const payload = contract.payload;
  const lines = [
    `### ${getWorkflowStage(contract.stage).label}（${contract.stage} v${contract.versionNo}）`,
    `核心判断：${payload.decision}`
  ];
  if (payload.readerPromise) {
    lines.push(`读者承诺：${payload.readerPromise}`);
  }
  if (payload.mustCarryForward.length > 0) {
    lines.push(`必须继承：${payload.mustCarryForward.join("；")}`);
  }
  if (payload.constraints.length > 0) {
    lines.push(`约束：${payload.constraints.join("；")}`);
  }
  if (payload.doNotDo.length > 0) {
    lines.push(`禁止方向：${payload.doNotDo.join("；")}`);
  }
  if (payload.risks.length > 0) {
    lines.push(`风险：${payload.risks.join("；")}`);
  }
  if (payload.qualityGate?.summaryForDownstream) {
    lines.push(`质量门下游摘要：${payload.qualityGate.summaryForDownstream}`);
  }
  return lines.join("\n");
}

export function buildStageContext(
  articleId: string,
  targetStage: DomainStage,
  db: WorkbenchDatabase = getDatabase().db
): CompiledStageContext {
  const definition = getWorkflowStage(targetStage);
  const required = new Set(definition.dependencies);
  const optional = new Set(definition.optionalDependencies);
  const contracts: CompiledStageContract[] = [];
  const missingRequiredStages: DomainStage[] = [];
  const missingOptionalStages: DomainStage[] = [];

  for (const stage of DOMAIN_STAGES) {
    if (!required.has(stage) && !optional.has(stage)) {
      continue;
    }
    const contract = compileContract(articleId, stage, db);
    if (contract) {
      contracts.push(contract);
    } else if (required.has(stage)) {
      missingRequiredStages.push(stage);
    } else {
      missingOptionalStages.push(stage);
    }
  }

  const promptText = contracts.length > 0 ? ["## 结构化上游契约", ...contracts.map(formatContractForPrompt)].join("\n\n") : "";
  const snapshot: StageContextSnapshot = {
    targetStage,
    contracts: contracts.map((contract) => ({ ...contract })),
    missingRequiredStages,
    missingOptionalStages
  };

  return {
    targetStage,
    contracts,
    missingRequiredStages,
    missingOptionalStages,
    promptText,
    snapshot
  };
}
