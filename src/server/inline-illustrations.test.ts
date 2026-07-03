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
  createInlineIllustrationClient,
  FakeInlineIllustrationClient,
  generateIllustrationPlan,
  generateInlineIllustration,
  getArticle,
  isPlaceholderInlineIllustrationAsset,
  markFinalDraft,
  MockRealInlineIllustrationClient,
  MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER,
  OpenAIImageInlineIllustrationClient,
  OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER,
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
  it("selects the inline illustration provider from configuration", () => {
    expect(createInlineIllustrationClient("")).toBeInstanceOf(FakeInlineIllustrationClient);
    expect(createInlineIllustrationClient("fake_svg_illustration")).toBeInstanceOf(FakeInlineIllustrationClient);
    expect(createInlineIllustrationClient("mock_real")).toBeInstanceOf(MockRealInlineIllustrationClient);
    expect(createInlineIllustrationClient(MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER)).toBeInstanceOf(MockRealInlineIllustrationClient);
    expect(createInlineIllustrationClient("openai_image")).toBeInstanceOf(OpenAIImageInlineIllustrationClient);
    expect(createInlineIllustrationClient(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER)).toBeInstanceOf(OpenAIImageInlineIllustrationClient);
    expect(() => createInlineIllustrationClient("unknown_provider")).toThrow("不支持的正文配图 provider");
  });

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

  it("generates a ready mock real PNG asset for a confirmed illustration plan item", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, draft, plan, item } = await createConfirmedIllustrationPlan(db);

    const asset = await generateInlineIllustration(
      article.id,
      { planId: plan.id, planItemId: item.itemId },
      new MockRealInlineIllustrationClient(),
      db,
      { assetRoot }
    );

    const saved = db.select().from(articleAssets).where(eq(articleAssets.id, asset.id)).get();
    const file = requireInlineIllustrationAssetFile(article.id, asset.id, db);

    expect(asset.assetType).toBe("inline_illustration");
    expect(asset.status).toBe("ready");
    expect(asset.draftVersionId).toBe(draft.id);
    expect(asset.provider).toBe(MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.path).toMatch(/\.png$/);
    expect(asset.promptSnapshot).toContain("Pure white background");
    expect(asset.promptSnapshot).toContain(item.promptBrief);
    expect(saved?.path).toBe(asset.path);
    expect(saved?.mimeType).toBe("image/png");
    expect(fs.existsSync(asset.path)).toBe(true);
    expect(fs.readFileSync(asset.path).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(isPlaceholderInlineIllustrationAsset(asset)).toBe(false);
    expect(file.contentType).toBe("image/png");
  });

  it("uses the configured mock real provider when no client is passed", async () => {
    const previousProvider = process.env.INLINE_ILLUSTRATION_PROVIDER;
    process.env.INLINE_ILLUSTRATION_PROVIDER = MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER;
    try {
      const { db } = createTestDatabase();
      const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
      const { article, plan, item } = await createConfirmedIllustrationPlan(db);

      const asset = await generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, undefined, db, {
        assetRoot
      });

      expect(asset.provider).toBe(MOCK_REAL_INLINE_ILLUSTRATION_PROVIDER);
      expect(asset.mimeType).toBe("image/png");
      expect(asset.path).toMatch(/\.png$/);
    } finally {
      if (previousProvider === undefined) {
        delete process.env.INLINE_ILLUSTRATION_PROVIDER;
      } else {
        process.env.INLINE_ILLUSTRATION_PROVIDER = previousProvider;
      }
    }
  });

  it("generates a ready PNG asset through the OpenAI-compatible image provider with mocked HTTP", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, plan, item } = await createConfirmedIllustrationPlan(db);
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const requests: { url: string; body: Record<string, unknown>; authorization: string | null }[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
        authorization: init?.headers instanceof Headers ? init.headers.get("authorization") : ((init?.headers as Record<string, string>)?.Authorization ?? null)
      });
      return new Response(JSON.stringify({ data: [{ b64_json: pngBase64 }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    const client = new OpenAIImageInlineIllustrationClient({
      apiKey: "test-image-key",
      baseUrl: "https://image.example/v1/",
      model: "test-image-model",
      size: "1200x675",
      fetchImpl
    });

    const asset = await generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, client, db, {
      assetRoot
    });
    const saved = db.select().from(articleAssets).where(eq(articleAssets.id, asset.id)).get();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://image.example/v1/images/generations",
      authorization: "Bearer test-image-key"
    });
    expect(requests[0]?.body).toMatchObject({
      model: "test-image-model",
      size: "1200x675",
      n: 1,
      response_format: "b64_json"
    });
    expect(String(requests[0]?.body.prompt)).toContain(item.promptBrief);
    expect(asset.provider).toBe(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.path).toMatch(/\.png$/);
    expect(asset.promptSnapshot).toContain("Pure white background");
    expect(saved?.provider).toBe(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER);
    expect(saved?.mimeType).toBe("image/png");
    expect(fs.existsSync(asset.path)).toBe(true);
    expect(fs.readFileSync(asset.path).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(isPlaceholderInlineIllustrationAsset(asset)).toBe(false);
  });

  it("records a failed asset when the configured real image provider is missing an API key", async () => {
    const { db } = createTestDatabase();
    const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-inline-assets-"));
    const { article, plan, item } = await createConfirmedIllustrationPlan(db);
    const client = new OpenAIImageInlineIllustrationClient({
      model: "test-image-model",
      fetchImpl: async () => new Response("{}")
    });

    await expect(
      generateInlineIllustration(article.id, { planId: plan.id, planItemId: item.itemId }, client, db, {
        assetRoot
      })
    ).rejects.toThrow("缺少 INLINE_ILLUSTRATION_IMAGE_API_KEY");

    const asset = db.select().from(articleAssets).where(eq(articleAssets.assetType, "inline_illustration")).get();
    expect(asset?.status).toBe("failed");
    expect(asset?.provider).toBe(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER);
    expect(asset?.errorMessage).toContain("缺少 INLINE_ILLUSTRATION_IMAGE_API_KEY");
    expect(asset?.path ? fs.existsSync(asset.path) : false).toBe(false);
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
