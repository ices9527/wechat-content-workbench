import { describe, expect, it } from "vitest";

import type { QualityGateReworkItem } from "./quality-gate-rework";
import { buildWorkflowGuidance } from "./workflow-guidance";

function rework(overrides: Partial<QualityGateReworkItem> = {}): QualityGateReworkItem {
  return {
    id: "rework-1",
    sourceId: "draft-contract",
    sourceLabel: "Markdown 文案",
    sourceStage: "draft",
    sourceVerdict: "revise",
    targetStage: "topic",
    targetTab: "topic",
    targetLabel: "主题",
    checkId: "topic.value",
    checkLabel: "选题价值",
    blockingLevel: "block",
    reason: "读者为什么现在要看仍不清楚。",
    suggestedAction: "回到主题页收敛读者问题。",
    sourceSummary: "先处理上游。",
    ...overrides
  };
}

describe("workflow guidance projection", () => {
  it("prioritizes blocking quality-gate rework over stale downstream runs", () => {
    const guidance = buildWorkflowGuidance({
      attentionStages: [
        { stage: "outline", status: "stale", reason: "角度已重选。", invalidatedByStage: "angle" }
      ],
      reworkItems: [rework()]
    });

    expect(guidance).toMatchObject({
      kind: "quality_rework",
      blocking: true,
      targetStage: "topic",
      targetWorkspace: "topic",
      targetTab: "topic",
      reason: "读者为什么现在要看仍不清楚。"
    });
    expect(guidance.affectedStages).toContain("publish");
  });

  it("selects the earliest stage needing confirmation or regeneration", () => {
    const guidance = buildWorkflowGuidance({
      attentionStages: [
        { stage: "draft", status: "stale", reason: "提纲已变更。", invalidatedByStage: "outline" },
        { stage: "topic", status: "needs_input", reason: "主题已修改，等待重新诊断。", invalidatedByStage: null }
      ],
      reworkItems: []
    });

    expect(guidance).toMatchObject({
      kind: "stage_attention",
      blocking: true,
      targetStage: "topic",
      targetTab: "topic",
      reason: "主题已修改，等待重新诊断。"
    });
  });

  it("returns a non-blocking continue result when no stage needs attention", () => {
    expect(buildWorkflowGuidance({ attentionStages: [], reworkItems: [] })).toEqual(
      expect.objectContaining({ kind: "continue", blocking: false, targetStage: null, affectedStages: [] })
    );
  });
});
