import { describe, expect, it } from "vitest";

import { buildPromptWithQualityGate, buildQualityGatePromptPlan, buildQualityGatePromptSection } from "./quality-gate-prompts";

function sectionBetween(prompt: string, start: string, end: string): string {
  const startIndex = prompt.indexOf(start);
  const endIndex = prompt.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return "";
  }
  return prompt.slice(startIndex, endIndex);
}

describe("quality gate prompt builder", () => {
  it("builds topic gate prompts with only topic checks as owned checks", () => {
    const section = buildQualityGatePromptSection("topic");
    const owned = sectionBetween(section, "### Owned Checks", "### Excluded Checks");
    const excluded = sectionBetween(section, "### Excluded Checks", "### 输出契约");

    expect(owned).toContain("topic.precondition");
    expect(owned).toContain("topic.value");
    expect(owned).not.toContain("outline.cognitive_gap");
    expect(owned).not.toContain("draft.text_cleanliness");
    expect(excluded).toContain("outline.cognitive_gap");
    expect(excluded).toContain("draft.text_cleanliness");
    expect(section).toContain("artifact");
    expect(section).toContain("qualityGate");
    expect(section).toContain("upstreamRework");
  });

  it("builds outline gate prompts without rechecking topic or draft ownership", () => {
    const plan = buildQualityGatePromptPlan("outline");

    expect(plan.ownedChecks.map((check) => check.id)).toEqual([
      "outline.cognitive_gap",
      "outline.mainline_judgment",
      "outline.structure_load"
    ]);
    expect(plan.excludedChecks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["topic.precondition", "topic.value", "draft.text_cleanliness", "draft.expression_efficiency"])
    );
  });

  it("builds draft gate prompts for expression checks only", () => {
    const section = buildQualityGatePromptSection("draft");
    const owned = sectionBetween(section, "### Owned Checks", "### Excluded Checks");

    expect(owned).toContain("draft.text_cleanliness");
    expect(owned).toContain("draft.expression_efficiency");
    expect(owned).toContain("draft.ai_trace");
    expect(owned).not.toContain("topic.value");
    expect(owned).not.toContain("outline.mainline_judgment");
    expect(section).toContain("检查文案表达层问题，不重新判断选题和主线。");
  });

  it("keeps dbs-content out of quality gate prompt ownership", () => {
    const topic = buildQualityGatePromptPlan("topic");
    const outline = buildQualityGatePromptPlan("outline");
    const draft = buildQualityGatePromptPlan("draft");

    expect([...topic.ownedChecks, ...outline.ownedChecks, ...draft.ownedChecks].some((check) => (check.ownerStage as string) === "dbs")).toBe(false);
    expect(buildQualityGatePromptSection("draft")).not.toContain("dbs-content");
  });

  it("appends a quality gate section without changing the base prompt", () => {
    const prompt = buildPromptWithQualityGate("基础任务\n必须只输出 JSON。", "topic");

    expect(prompt.startsWith("基础任务\n必须只输出 JSON。")).toBe(true);
    expect(prompt).toContain("## 节点质量门");
    expect(prompt.indexOf("基础任务")).toBeLessThan(prompt.indexOf("## 节点质量门"));
  });

  it("rejects unsupported prompt stages", () => {
    expect(() => buildQualityGatePromptSection("research")).toThrow("Unsupported quality gate prompt stage: research");
  });
});
