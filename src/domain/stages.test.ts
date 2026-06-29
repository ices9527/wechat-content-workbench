import { describe, expect, it } from "vitest";

import { defaultStagePromptLabel, FUTURE_REQUIREMENT_STAGES, requirementStageSchema, REQUIREMENT_STAGES, stagePromptStageSchema } from "./stages";

describe("stage definitions", () => {
  it("keeps supported requirement stages centralized", () => {
    expect(REQUIREMENT_STAGES).toEqual(["topic", "angle", "research", "outline", "draft", "ai_style_check", "dbs", "pre_publish", "review"]);
    expect(requirementStageSchema.safeParse("topic").success).toBe(true);
    expect(requirementStageSchema.safeParse("research").success).toBe(true);
    expect(requirementStageSchema.safeParse("draft").success).toBe(true);
    expect(requirementStageSchema.safeParse("ai_style_check").success).toBe(true);
  });

  it("documents future stages without enabling them early", () => {
    expect(FUTURE_REQUIREMENT_STAGES).toContain("illustration");
    expect(FUTURE_REQUIREMENT_STAGES).not.toContain("ai_style_check");
  });

  it("maps stages to stable default prompt labels", () => {
    expect(defaultStagePromptLabel("research")).toBe("内容研究默认提示词");
    expect(defaultStagePromptLabel("outline")).toBe("主线提纲默认提示词");
    expect(defaultStagePromptLabel("draft")).toBe("Markdown 文案默认提示词");
    expect(defaultStagePromptLabel("ai_style_check")).toBe("文案清洁检查默认提示词");
    expect(stagePromptStageSchema.safeParse("topic").success).toBe(false);
    expect(stagePromptStageSchema.safeParse("ai_style_check").success).toBe(true);
  });
});
