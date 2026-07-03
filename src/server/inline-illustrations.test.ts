import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { articleAssets, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient } from "./ai";
import { createArticleWithDraft } from "./articles-test-utils";
import {
  buildRealInlineIllustrationPrompt,
  confirmIllustrationPlan,
  createArticle,
  FakeInlineIllustrationClient,
  generateIllustrationPlan,
  generateInlineIllustration,
  getArticle,
  isPlaceholderInlineIllustrationAsset,
  markFinalDraft,
  parseIllustrationPlanPayload,
  requireInlineIllustrationAssetFile
} from "./articles";

class FailingInlineIllustrationClient extends FakeInlineIllustrationClient {
  provider = "failing_svg_provider";

  async generate(): Promise<never> {
    throw new Error("provider down");
  }
}

async function createConfirmedIllustrationPlan(db: ReturnType<typeof createTestDatabase>["db"]) {
  const { article, draft } = await createArticleWithDraft(db);
  markFinalDraft(article.id, { draftVersionId: draft.id }, db);
  const plan = await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
  const confirmed = confirmIllustrationPlan(article.id, { planId: plan.id }, db);
  const item = parseIllustrationPlanPayload(confirmed.planJson).items[0];
  return { article, draft, plan: confirmed, item };
}

describe("inline illustration generation service", () => {
  it("builds a real inline illustration prompt from article context, plan item, and style constraints", async () => {
    const { db } = createTestDatabase();
    const { article, draft, item } = await createConfirmedIllustrationPlan(db);

    const prompt = buildRealInlineIllustrationPrompt({ article, draft, item, width: 1200, height: 675 });

    expect(prompt).toContain("Generate one standalone 16:9 horizontal Chinese article illustration");
    expect(prompt).toContain("Pure white background");
    expect(prompt).toContain("Minimalist black hand-drawn line art");
    expect(prompt).toContain("小黑 must perform the core conceptual action");
    expect(prompt).toContain(article.title);
    expect(prompt).toContain(article.topic);
    expect(prompt).toContain(item.position);
    expect(prompt).toContain(item.purpose);
    expect(prompt).toContain(item.visualBrief);
    expect(prompt).toContain(item.promptBrief);
    expect(prompt).toContain("at most 5-8 short handwritten Chinese labels");
    expect(prompt).toContain("Do not make a PPT infographic");
    expect(prompt).toContain("Do not include the words Fake SVG");
  });

  it("puts compliance and visualization boundaries into the real inline illustration prompt", async () => {
    const { db } = createTestDatabase();
    const { article, draft, item } = await createConfirmedIllustrationPlan(db);
    const riskyItem = {
      ...item,
      doNotVisualize: "不要画成开户绿色通道，也不要画确定到账。",
      riskNotes: "只表达生活资金路径更清楚，不承诺收益、身份或审批结果。"
    };

    const prompt = buildRealInlineIllustrationPrompt({ article, draft, item: riskyItem, width: 1200, height: 675 });

    expect(prompt).toContain("不要画成开户绿色通道，也不要画确定到账。");
    expect(prompt).toContain("只表达生活资金路径更清楚，不承诺收益、身份或审批结果。");
    expect(prompt).toContain("Do not promise收益、开户、身份、审批、到账、交易、投资结果");
    expect(prompt).toContain("Do not copy prior examples");
  });

  it("identifies fake SVG inline illustrations as non-publishable placeholders", () => {
    expect(
      isPlaceholderInlineIllustrationAsset({
        assetType: "inline_illustration",
        provider: "fake_svg_illustration"
      })
    ).toBe(true);
    expect(
      isPlaceholderInlineIllustrationAsset({
        assetType: "inline_illustration",
        provider: "real_inline_illustration"
      })
    ).toBe(false);
    expect(
      isPlaceholderInlineIllustrationAsset({
        assetType: "cover",
        provider: "fake_svg_illustration"
      })
    ).toBe(false);
    expect(isPlaceholderInlineIllustrationAsset(null)).toBe(false);
  });

  it("generates a ready SVG asset for a confirmed illustration plan item", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, draft, plan, item } = await createConfirmedIllustrationPlan(db);
    const statusBefore = getArticle(article.id, db)?.status;

    const asset = await generateInlineIllustration(
      article.id,
      { planId: plan.id, planItemId: item.itemId },
      new FakeInlineIllustrationClient(),
      db,
      { assetRoot }
    );

    const saved = db.select().from(articleAssets).where(eq(articleAssets.id, asset.id)).get();
    const event = db.select().from(workflowEvents).where(eq(workflowEvents.eventType, "generate_inline_illustration")).get();

    expect(asset.assetType).toBe("inline_illustration");
    expect(asset.status).toBe("ready");
    expect(asset.draftVersionId).toBe(draft.id);
    expect(asset.sourcePlanId).toBe(plan.id);
    expect(asset.sourcePlanItemId).toBe(item.itemId);
    expect(asset.provider).toBe("fake_svg_illustration");
    expect(asset.promptSnapshot).toContain(item.promptBrief);
    expect(asset.promptSnapshot).toContain(article.title);
    expect(asset.promptSnapshot).toContain("Pure white background");
    expect(asset.promptSnapshot).toContain("Do not include the words Fake SVG");
    expect(asset.generatedAt).toBeTruthy();
    expect(saved?.status).toBe("ready");
    expect(fs.existsSync(asset.path)).toBe(true);
    expect(fs.readFileSync(asset.path, "utf8")).toContain("Fake SVG");
    expect(event?.payloadJson).toContain(asset.id);
    expect(getArticle(article.id, db)?.status).toBe(statusBefore);

    const file = requireInlineIllustrationAssetFile(article.id, asset.id, db);
    expect(file.contentType).toBe("image/svg+xml");
    expect(file.content.toString("utf8")).toContain("Fake SVG");
  });

  it("keeps old inline illustration assets when regenerating the same plan item", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, plan, item } = await createConfirmedIllustrationPlan(db);

    const first = await generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, new FakeInlineIllustrationClient(), db, {
      assetRoot
    });
    const second = await generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, new FakeInlineIllustrationClient(), db, {
      assetRoot
    });

    const assets = db.select().from(articleAssets).where(eq(articleAssets.assetType, "inline_illustration")).all();
    expect(assets).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(first.path).not.toBe(second.path);
    expect(assets.every((asset) => asset.status === "ready")).toBe(true);
  });

  it("rejects generation before the illustration plan is confirmed", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const plan = await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
    const item = parseIllustrationPlanPayload(plan.planJson).items[0];

    await expect(
      generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, new FakeInlineIllustrationClient(), db)
    ).rejects.toThrow("请先确认配图规划");
    expect(db.select().from(articleAssets).all()).toHaveLength(0);
  });

  it("rejects missing and cross-article plan items", async () => {
    const { db } = createTestDatabase();
    const { article, plan } = await createConfirmedIllustrationPlan(db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    await expect(
      generateInlineIllustration(article.id, { planId: plan.id, planItemId: "missing-item" }, new FakeInlineIllustrationClient(), db)
    ).rejects.toThrow("配图规划项不存在");
    await expect(
      generateInlineIllustration(other.id, { planId: plan.id, planItemId: "item-1" }, new FakeInlineIllustrationClient(), db)
    ).rejects.toThrow("配图规划不存在");
  });

  it("records a failed asset when the provider fails", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, plan, item } = await createConfirmedIllustrationPlan(db);

    await expect(
      generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, new FailingInlineIllustrationClient(), db, {
        assetRoot
      })
    ).rejects.toThrow("provider down");

    const asset = db.select().from(articleAssets).where(eq(articleAssets.assetType, "inline_illustration")).get();
    const event = db.select().from(workflowEvents).where(eq(workflowEvents.eventType, "generate_inline_illustration_failed")).get();

    expect(asset?.status).toBe("failed");
    expect(asset?.provider).toBe("failing_svg_provider");
    expect(asset?.errorMessage).toBe("provider down");
    expect(asset?.generatedAt).toBeTruthy();
    expect(asset?.path ? fs.existsSync(asset.path) : false).toBe(false);
    expect(event?.payloadJson).toContain("provider down");
    expect(() => requireInlineIllustrationAssetFile(article.id, asset?.id || "", db)).toThrow("正文配图资产尚未生成成功");
  });

  it("rejects cross-article inline illustration file reads", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, plan, item } = await createConfirmedIllustrationPlan(db);
    const other = createArticle({ topic: "另一篇文章" }, db);
    const asset = await generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, new FakeInlineIllustrationClient(), db, {
      assetRoot
    });

    expect(() => requireInlineIllustrationAssetFile(other.id, asset.id, db)).toThrow("正文配图资产不存在");
  });
});
