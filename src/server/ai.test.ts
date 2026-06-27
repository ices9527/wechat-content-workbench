import { describe, expect, it } from "vitest";

import { FakeAIClient, normalizeGeneratedDraft, normalizeGeneratedOutline } from "./ai";

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

  it("normalizes outline responses with Chinese field names", () => {
    const outline = normalizeGeneratedOutline({
      文章标题: "香港账户还能不能开",
      目标读者: "一线城市中产家庭",
      文章主线: "真正变了的不是开户，而是资金路径能不能解释清楚。",
      提纲: "## 一、账户不是终点\n- 路径才是长期问题。"
    });

    expect(outline.mainline).toContain("资金路径");
    expect(outline.outlineMarkdown).toContain("账户不是终点");
  });

  it("builds outline markdown from structured object responses", () => {
    const outline = normalizeGeneratedOutline({
      主线判断: "账户只是工具，路径才是判断。",
      文章标题: "香港账户还能不能开",
      开头场景: "很多人先问还能不能开户。",
      小标题: ["账户不是终点", "入金和长期使用是两件事"]
    });

    expect(outline.mainline).toContain("路径");
    expect(outline.outlineMarkdown).toContain("## 文章标题");
    expect(outline.outlineMarkdown).toContain("## 小标题");
  });

  it("normalizes draft responses with non-standard markdown fields", () => {
    const draft = normalizeGeneratedDraft({
      文案: "# 香港账户还能不能开\n\n真正变了的不是开户，而是资金路径。"
    });

    expect(draft.markdown).toContain("# 香港账户还能不能开");
    expect(draft.markdown).toContain("资金路径");
  });

  it("builds draft markdown from structured object responses", () => {
    const draft = normalizeGeneratedDraft({
      标题: "香港账户还能不能开",
      开头: "很多人先问还能不能开户。",
      正文结构: [
        {
          小标题: "账户不是终点",
          内容: "真正要解释清楚的是资金来源、用途和回流路径。"
        }
      ]
    });

    expect(draft.markdown).toContain("## 标题");
    expect(draft.markdown).toContain("香港账户还能不能开");
    expect(draft.markdown).toContain("账户不是终点");
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
