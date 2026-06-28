import { describe, expect, it } from "vitest";

import { defaultStagePromptLabel, FUTURE_REQUIREMENT_STAGES, requirementStageSchema, REQUIREMENT_STAGES, stagePromptStageSchema } from "./stages";

describe("stage definitions", () => {
  it("keeps supported requirement stages centralized", () => {
    expect(REQUIREMENT_STAGES).toEqual(["topic", "angle", "outline", "draft", "dbs", "pre_publish", "review"]);
    expect(requirementStageSchema.safeParse("topic").success).toBe(true);
    expect(requirementStageSchema.safeParse("draft").success).toBe(true);
    expect(requirementStageSchema.safeParse("research").success).toBe(false);
  });

  it("documents future stages without enabling them early", () => {
    expect(FUTURE_REQUIREMENT_STAGES).toContain("research");
    expect(FUTURE_REQUIREMENT_STAGES).toContain("stop_slop");
    expect(FUTURE_REQUIREMENT_STAGES).toContain("illustration");
  });

  it("maps stages to stable default prompt labels", () => {
    expect(defaultStagePromptLabel("outline")).toBe("主线提纲默认提示词");
    expect(defaultStagePromptLabel("draft")).toBe("Markdown 文案默认提示词");
    expect(stagePromptStageSchema.safeParse("topic").success).toBe(false);
  });
});
