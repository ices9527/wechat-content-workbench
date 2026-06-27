import { describe, expect, it } from "vitest";

import { FakeAIClient } from "./ai";

describe("fake AI client", () => {
  it("generates at least five structured angles", async () => {
    const client = new FakeAIClient();
    const angles = await client.generateAngles();
    expect(angles.length).toBeGreaterThanOrEqual(5);
    expect(angles[0]).toHaveProperty("angleTitle");
    expect(angles[0]).toHaveProperty("readerPain");
  });

  it("generates outline and draft content", async () => {
    const client = new FakeAIClient();
    const outline = await client.generateOutline();
    const draft = await client.generateDraft();

    expect(outline.mainline).toContain("这篇文章");
    expect(draft.markdown).toContain("#");
  });

  it("generates structured diagnosis and revised draft content", async () => {
    const client = new FakeAIClient();
    const diagnosis = await client.diagnoseContent();
    const revised = await client.reviseDraft();

    expect(diagnosis.diagnosisMarkdown).toContain("内容创作诊断报告");
    expect(diagnosis.textCleanliness).toContain("文字");
    expect(diagnosis.titleCover).toContain("标题");
    expect(diagnosis.expressionEfficiency).toContain("冗余");
    expect(diagnosis.cognitiveGap).toContain("落差");
    expect(diagnosis.aiTrace).toContain("AI");
    expect(revised.markdown).toContain("#");
  });

  it("generates prompt artifacts for publish and review checks", async () => {
    const client = new FakeAIClient();
    const prePublish = await client.generatePrePublishCheck();
    const review = await client.generateReviewCheck();

    expect(prePublish.summaryMarkdown).toContain("发布前检查摘要");
    expect(review.summaryMarkdown).toContain("复盘归因检查清单");
  });
});
