import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocations, outlineVersions, researchVersions } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import type { GeneratedContentResearch } from "./ai";
import { FakeAIClient } from "./articles-test-utils";
import { createArticle, createManualAngle, generateContentResearch, generateOutline, listResearchVersions, selectAngle } from "./articles";

class FailingContentResearchClient extends FakeAIClient {
  async generateContentResearch(): Promise<never> {
    throw new Error("research unavailable");
  }
}

class EmptyContentResearchClient extends FakeAIClient {
  async generateContentResearch(): Promise<GeneratedContentResearch> {
    return {
      factsMarkdown: "",
      backgroundMarkdown: "",
      readerQuestionsMarkdown: "",
      boundariesMarkdown: "",
      writeableDirectionsMarkdown: "",
      avoidDirectionsMarkdown: "",
      summaryMarkdown: ""
    };
  }
}

describe("article content research service", () => {
  it("generates a content research package from the selected angle", async () => {
    const { db } = createTestDatabase();
    const article = createArticle(
      {
        topic: "跨境支付通",
        targetReader: "跨境家庭",
        coreProblem: "资金路径是否更可操作",
        hotAnchor: "支付工具上线"
      },
      db
    );
    const angle = createManualAngle(article.id, {
      angleTitle: "速度只是表层",
      readerPain: "只看到到账快",
      promise: "看懂家庭现金流边界",
      risk: "避免写成投资通道"
    }, db);
    selectAngle(article.id, angle.id, db);

    const research = await generateContentResearch(
      article.id,
      { customInstruction: "重点研究家庭现金流场景。" },
      new FakeAIClient(),
      db
    );
    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "content_research")).all();

    expect(research.versionNo).toBe(1);
    expect(research.sourceAngleId).toBe(angle.id);
    expect(research.sourceInvocationId).toBe(invocations[0].id);
    expect(research.researchMarkdown).toContain("## 核心事实");
    expect(research.summaryMarkdown).toContain("家庭");
    expect(invocations[0].prompt).toContain("不写正文");
    expect(invocations[0].prompt).toContain("重点研究家庭现金流场景。");
  });

  it("keeps multiple research versions as history", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);

    await generateContentResearch(article.id, {}, new FakeAIClient(), db);
    await generateContentResearch(article.id, { customInstruction: "换一个研究重点。" }, new FakeAIClient(), db);

    const versions = listResearchVersions(article.id, db);
    expect(versions).toHaveLength(2);
    expect(versions[0].versionNo).toBe(2);
    expect(versions[1].versionNo).toBe(1);
  });

  it("requires a selected angle before generating research", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);

    await expect(generateContentResearch(article.id, {}, new FakeAIClient(), db)).rejects.toThrow("请先选择一个角度");
    expect(db.select().from(researchVersions).all()).toHaveLength(0);
  });

  it("records failed content research invocations", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);

    await expect(generateContentResearch(article.id, {}, new FailingContentResearchClient(), db)).rejects.toThrow("research unavailable");

    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "content_research")).all();
    expect(invocations).toHaveLength(1);
    expect(invocations[0].status).toBe("failed");
    expect(invocations[0].errorMessage).toBe("research unavailable");
    expect(db.select().from(researchVersions).all()).toHaveLength(0);
  });

  it("rejects empty content research packages", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);

    await expect(generateContentResearch(article.id, {}, new EmptyContentResearchClient(), db)).rejects.toThrow(
      "AI 返回的研究资料包为空"
    );
    expect(db.select().from(researchVersions).all()).toHaveLength(0);
  });

  it("generates outline with an optional research package reference", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);
    const research = await generateContentResearch(article.id, {}, new FakeAIClient(), db);

    const outline = await generateOutline(article.id, new FakeAIClient(), db, { researchVersionId: research.id });
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_outline")).get();

    expect(outline.sourceResearchVersionId).toBe(research.id);
    expect(invocation?.prompt).toContain("内容研究资料包摘要");
    expect(invocation?.prompt).toContain(research.summaryMarkdown);
    expect(invocation?.prompt).toContain("资料包边界提醒");
  });

  it("keeps the old outline flow working without research", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);

    const outline = await generateOutline(article.id, new FakeAIClient(), db);

    expect(outline.sourceResearchVersionId).toBeNull();
    expect(db.select().from(outlineVersions).all()).toHaveLength(1);
  });

  it("rejects research packages from another article", async () => {
    const { db } = createTestDatabase();
    const first = createArticle({ topic: "第一篇" }, db);
    const firstAngle = createManualAngle(first.id, { angleTitle: "第一角度" }, db);
    selectAngle(first.id, firstAngle.id, db);
    const research = await generateContentResearch(first.id, {}, new FakeAIClient(), db);

    const second = createArticle({ topic: "第二篇" }, db);
    const secondAngle = createManualAngle(second.id, { angleTitle: "第二角度" }, db);
    selectAngle(second.id, secondAngle.id, db);

    await expect(generateOutline(second.id, new FakeAIClient(), db, { researchVersionId: research.id })).rejects.toThrow("研究资料包不存在");
  });
});
