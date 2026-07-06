import { describe, expect, it } from "vitest";

import {
  checkBelongsToStage,
  findQualityGateResultContractIssues,
  getQualityCheck,
  hasDuplicateQualityCheckIds,
  listQualityChecks,
  QUALITY_CHECKS,
  QUALITY_CHECK_RESULT_STATUSES,
  QUALITY_GATE_STAGES,
  QUALITY_GATE_VERDICTS,
  type QualityGateResult
} from "./quality-gates";

describe("quality gate definitions", () => {
  it("keeps quality checks uniquely owned", () => {
    expect(hasDuplicateQualityCheckIds(QUALITY_CHECKS)).toBe(false);
    expect(listQualityChecks("topic").map((check) => check.id)).toEqual(["topic.precondition", "topic.value"]);
    expect(listQualityChecks("outline").map((check) => check.id)).toEqual([
      "outline.cognitive_gap",
      "outline.mainline_judgment",
      "outline.structure_load"
    ]);
    expect(listQualityChecks("draft").map((check) => check.id)).toEqual([
      "draft.text_cleanliness",
      "draft.expression_efficiency",
      "draft.ai_trace"
    ]);
  });

  it("does not assign new quality ownership to legacy dbs-content", () => {
    expect(QUALITY_GATE_STAGES as readonly string[]).not.toContain("dbs");
    expect(listQualityChecks().some((check) => (check.ownerStage as string) === "dbs")).toBe(false);
  });

  it("keeps downstream checks out of upstream owners", () => {
    expect(listQualityChecks("topic").map((check) => check.id)).not.toContain("draft.text_cleanliness");
    expect(listQualityChecks("draft").map((check) => check.id)).not.toContain("topic.precondition");
    expect(listQualityChecks("draft").map((check) => check.id)).not.toContain("outline.cognitive_gap");
  });

  it("looks up checks by stable id", () => {
    expect(getQualityCheck("pre_publish.release_risk")?.blockingLevel).toBe("block");
    expect(getQualityCheck("dbs.content_quality")).toBeUndefined();
  });

  it("defines a stable result contract vocabulary", () => {
    expect(QUALITY_GATE_VERDICTS).toEqual(["pass", "revise", "hold", "drop"]);
    expect(QUALITY_CHECK_RESULT_STATUSES).toEqual(["pass", "issue", "not_applicable"]);
  });

  it("validates that owned checks stay inside the result stage", () => {
    const result: QualityGateResult = {
      stage: "outline",
      verdict: "revise",
      ownedChecks: [
        {
          checkId: "outline.cognitive_gap",
          status: "issue",
          evidence: "主线还没有形成读者从旧理解到新理解的转变。",
          suggestion: "先重写主线判断，再展开提纲。"
        }
      ],
      upstreamRework: [
        {
          targetStage: "topic",
          checkId: "topic.value",
          reason: "当前主线无法判断读者为什么现在需要读。",
          suggestedAction: "回到选题诊断收敛读者问题和行动价值。"
        }
      ],
      summaryForDownstream: "主线需重写后再生成文案。"
    };

    expect(checkBelongsToStage("outline.cognitive_gap", "outline")).toBe(true);
    expect(findQualityGateResultContractIssues(result)).toEqual([]);
  });

  it("flags duplicate diagnosis ownership in a gate result", () => {
    const result: QualityGateResult = {
      stage: "draft",
      verdict: "revise",
      ownedChecks: [
        {
          checkId: "topic.precondition",
          status: "issue",
          evidence: "文案阶段不应完整复查前置条件。",
          suggestion: "只输出回到选题节点的建议。"
        }
      ],
      upstreamRework: [
        {
          targetStage: "outline",
          checkId: "draft.text_cleanliness",
          reason: "错误地把文案表达问题路由到主线节点。",
          suggestedAction: "回到文案节点处理表达问题。"
        }
      ],
      summaryForDownstream: "契约应被拒绝。"
    };

    expect(findQualityGateResultContractIssues(result)).toEqual([
      "ownedChecks includes topic.precondition, but its owner is topic",
      "upstreamRework routes draft.text_cleanliness to outline, but its owner is draft"
    ]);
  });
});
