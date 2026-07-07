import { describe, expect, it } from "vitest";

import type { QualityGateResult } from "./quality-gates";
import {
  buildQualityGateReworkItems,
  qualityGateStageToReworkLabel,
  qualityGateStageToReworkTab,
  shouldBlockContinuationForQualityGate
} from "./quality-gate-rework";

function qualityGate(overrides: Partial<QualityGateResult> = {}): QualityGateResult {
  return {
    stage: "draft",
    verdict: "revise",
    ownedChecks: [
      {
        checkId: "draft.text_cleanliness",
        status: "issue",
        evidence: "文案表达绕。",
        suggestion: "删除重复铺垫。"
      }
    ],
    upstreamRework: [],
    summaryForDownstream: "文案需要改得更直接。",
    ...overrides
  };
}

describe("quality gate rework view mapping", () => {
  it("maps quality gate owner stages to workflow tabs and labels", () => {
    expect(qualityGateStageToReworkTab("topic")).toBe("topic");
    expect(qualityGateStageToReworkTab("outline")).toBe("outline");
    expect(qualityGateStageToReworkTab("draft")).toBe("draft");
    expect(qualityGateStageToReworkTab("pre_publish")).toBe("publish");
    expect(qualityGateStageToReworkLabel("topic")).toBe("主题");
    expect(qualityGateStageToReworkLabel("outline")).toBe("主线提纲");
  });

  it("builds stable UI rework items from quality gate upstream rework", () => {
    const items = buildQualityGateReworkItems([
      {
        id: "draft-check-1",
        label: "文案清洁检查",
        result: qualityGate({
          upstreamRework: [
            {
              targetStage: "topic",
              checkId: "topic.value",
              reason: "文案阶段发现读者为什么现在需要读仍不清楚。",
              suggestedAction: "回到主题页收敛读者问题，再重新运行选题诊断。"
            },
            {
              targetStage: "outline",
              checkId: "outline.mainline_judgment",
              reason: "文案无法承接一句清楚主线。",
              suggestedAction: "回到主线提纲页，把主线改成一句判断。"
            }
          ],
          summaryForDownstream: "不要继续硬改正文，先处理上游问题。"
        })
      }
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        sourceId: "draft-check-1",
        sourceLabel: "文案清洁检查",
        sourceStage: "draft",
        sourceVerdict: "revise",
        targetStage: "topic",
        targetTab: "topic",
        targetLabel: "主题",
        checkId: "topic.value",
        checkLabel: "选题价值",
        blockingLevel: "block",
        reason: "文案阶段发现读者为什么现在需要读仍不清楚。",
        suggestedAction: "回到主题页收敛读者问题，再重新运行选题诊断。",
        sourceSummary: "不要继续硬改正文，先处理上游问题。"
      }),
      expect.objectContaining({
        targetStage: "outline",
        targetTab: "outline",
        targetLabel: "主线提纲",
        checkId: "outline.mainline_judgment",
        checkLabel: "主线判断",
        blockingLevel: "block"
      })
    ]);
  });

  it("skips empty sources and deduplicates identical rework items", () => {
    const duplicated = {
      targetStage: "topic" as const,
      checkId: "topic.precondition" as const,
      reason: "目标读者太泛。",
      suggestedAction: "回到主题页补齐目标读者。"
    };

    const items = buildQualityGateReworkItems([
      { id: "empty", label: "空结果", result: null },
      {
        id: "topic-diagnosis",
        label: "选题诊断",
        result: qualityGate({
          upstreamRework: [duplicated, duplicated]
        })
      }
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceId: "topic-diagnosis",
      targetTab: "topic",
      checkLabel: "前置条件"
    });
  });

  it("detects hold, drop and blocking upstream rework as continuation blockers", () => {
    expect(shouldBlockContinuationForQualityGate(qualityGate({ verdict: "hold" }))).toBe(true);
    expect(shouldBlockContinuationForQualityGate(qualityGate({ verdict: "drop" }))).toBe(true);
    expect(
      shouldBlockContinuationForQualityGate(
        qualityGate({
          verdict: "revise",
          upstreamRework: [
            {
              targetStage: "topic",
              checkId: "topic.value",
              reason: "选题价值不清楚。",
              suggestedAction: "回到主题页处理。"
            }
          ]
        })
      )
    ).toBe(true);
    expect(
      shouldBlockContinuationForQualityGate(
        qualityGate({
          verdict: "revise",
          upstreamRework: [
            {
              targetStage: "draft",
              checkId: "draft.text_cleanliness",
              reason: "只是表达水分。",
              suggestedAction: "回到文案页处理。"
            }
          ]
        })
      )
    ).toBe(false);
  });
});
