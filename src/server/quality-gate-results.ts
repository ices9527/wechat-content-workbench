import {
  QUALITY_CHECK_RESULT_STATUSES,
  QUALITY_GATE_STAGES,
  QUALITY_GATE_VERDICTS,
  findQualityGateResultContractIssues,
  getQualityCheck,
  type QualityCheckId,
  type QualityCheckResultStatus,
  type QualityGateResult,
  type QualityGateStage,
  type QualityGateVerdict
} from "@/domain/quality-gates";

function stringifyQualityGateValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyQualityGateValue).filter(Boolean).join("\n");
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstRawValue(json: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (json[key] !== undefined && json[key] !== null) {
      return json[key];
    }
  }
  return undefined;
}

function normalizeQualityGateVerdict(value: unknown): QualityGateVerdict {
  const normalized = stringifyQualityGateValue(value).toLowerCase();
  if (normalized.includes("暂缓") || normalized.includes("hold") || normalized.includes("暂停") || normalized.includes("观望")) {
    return "hold";
  }
  if (normalized.includes("放弃") || normalized.includes("drop") || normalized.includes("不建议") || normalized.includes("不要做")) {
    return "drop";
  }
  if (normalized.includes("修改") || normalized.includes("revise") || normalized.includes("调整") || normalized.includes("补充")) {
    return "revise";
  }
  if (normalized.includes("通过") || normalized.includes("pass") || normalized.includes("可以继续")) {
    return "pass";
  }
  if ((QUALITY_GATE_VERDICTS as readonly string[]).includes(normalized)) {
    return normalized as QualityGateVerdict;
  }
  throw new Error("AI 返回的 qualityGate.verdict 无效");
}

function normalizeQualityGateStage(value: unknown, expectedStage: QualityGateStage): QualityGateStage {
  const stage = stringifyQualityGateValue(value) || expectedStage;
  if (!(QUALITY_GATE_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`AI 返回的 qualityGate.stage 无效：${stage}`);
  }
  if (stage !== expectedStage) {
    throw new Error(`AI 返回的 qualityGate.stage 应为 ${expectedStage}，实际为 ${stage}`);
  }
  return stage as QualityGateStage;
}

function normalizeQualityCheckId(value: unknown): QualityCheckId {
  const checkId = stringifyQualityGateValue(value);
  if (!getQualityCheck(checkId)) {
    throw new Error(`AI 返回了未知质量检查项：${checkId || "empty"}`);
  }
  return checkId as QualityCheckId;
}

function normalizeQualityCheckStatus(value: unknown): QualityCheckResultStatus {
  const normalized = stringifyQualityGateValue(value).toLowerCase();
  if (normalized.includes("不适用") || normalized.includes("not_applicable") || normalized.includes("n/a")) {
    return "not_applicable";
  }
  if (normalized.includes("问题") || normalized.includes("issue") || normalized.includes("未通过") || normalized.includes("fail")) {
    return "issue";
  }
  if (normalized.includes("通过") || normalized.includes("pass")) {
    return "pass";
  }
  if ((QUALITY_CHECK_RESULT_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as QualityCheckResultStatus;
  }
  throw new Error("AI 返回的 ownedChecks[].status 无效");
}

function normalizeOwnedChecks(value: unknown): QualityGateResult["ownedChecks"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("AI 返回的 qualityGate.ownedChecks 不能为空");
  }

  return value.map((item) => {
    const record = asRecord(item);
    if (!record) {
      throw new Error("AI 返回的 qualityGate.ownedChecks 必须是对象数组");
    }
    return {
      checkId: normalizeQualityCheckId(firstRawValue(record, ["checkId", "check_id", "检查项"])),
      status: normalizeQualityCheckStatus(firstRawValue(record, ["status", "状态", "result"])),
      evidence: stringifyQualityGateValue(firstRawValue(record, ["evidence", "证据", "判断依据"])) || null,
      suggestion: stringifyQualityGateValue(firstRawValue(record, ["suggestion", "建议", "fix"])) || null
    };
  });
}

function normalizeUpstreamRework(value: unknown): QualityGateResult["upstreamRework"] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("AI 返回的 qualityGate.upstreamRework 必须是数组");
  }

  return value.map((item) => {
    const record = asRecord(item);
    if (!record) {
      throw new Error("AI 返回的 qualityGate.upstreamRework 必须是对象数组");
    }
    const checkId = normalizeQualityCheckId(firstRawValue(record, ["checkId", "check_id", "检查项"]));
    return {
      targetStage: normalizeQualityGateStage(firstRawValue(record, ["targetStage", "target_stage", "目标节点"]), getQualityCheck(checkId)?.ownerStage || "topic"),
      checkId,
      reason: stringifyQualityGateValue(firstRawValue(record, ["reason", "原因"])) || "需要回到真实 owner 节点处理。",
      suggestedAction: stringifyQualityGateValue(firstRawValue(record, ["suggestedAction", "suggested_action", "建议动作"])) || "重新检查该节点质量门。"
    };
  });
}

function findQualityGateRecord(json: Record<string, unknown>): Record<string, unknown> | null {
  const nested = asRecord(firstRawValue(json, ["qualityGate", "quality_gate", "质量门"]));
  if (nested) {
    return nested;
  }
  if (json.stage !== undefined && json.verdict !== undefined && json.ownedChecks !== undefined) {
    return json;
  }
  return null;
}

export function normalizeQualityGateResult(json: Record<string, unknown>, expectedStage: QualityGateStage): QualityGateResult {
  const qualityGate = findQualityGateRecord(json);
  if (!qualityGate) {
    throw new Error("AI 返回缺少 qualityGate");
  }

  const result: QualityGateResult = {
    stage: normalizeQualityGateStage(firstRawValue(qualityGate, ["stage", "阶段"]), expectedStage),
    verdict: normalizeQualityGateVerdict(firstRawValue(qualityGate, ["verdict", "结论", "诊断结论"])),
    ownedChecks: normalizeOwnedChecks(firstRawValue(qualityGate, ["ownedChecks", "owned_checks", "检查结果"])),
    upstreamRework: normalizeUpstreamRework(firstRawValue(qualityGate, ["upstreamRework", "upstream_rework", "上游返工"])),
    summaryForDownstream: stringifyQualityGateValue(
      firstRawValue(qualityGate, ["summaryForDownstream", "summary_for_downstream", "下游摘要"])
    )
  };

  if (!result.summaryForDownstream) {
    throw new Error("AI 返回的 qualityGate.summaryForDownstream 不能为空");
  }

  const issues = findQualityGateResultContractIssues(result);
  if (issues.length > 0) {
    throw new Error(`AI 返回的 qualityGate 不符合契约：${issues.join("；")}`);
  }

  return result;
}

export function extractQualityGateResultFromResponse(responseJson: string | null, expectedStage: QualityGateStage): QualityGateResult | null {
  if (!responseJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(responseJson) as unknown;
    const record = asRecord(parsed);
    return record ? normalizeQualityGateResult(record, expectedStage) : null;
  } catch {
    return null;
  }
}
