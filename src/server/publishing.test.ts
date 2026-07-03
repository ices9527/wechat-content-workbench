import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { articleAssets, wechatDraftUploadImages, wechatDraftUploads } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient } from "./ai";
import {
  confirmIllustrationPlan,
  acceptOutline,
  createArticle,
  createManualAngle,
  FakeInlineIllustrationClient,
  generateIllustrationPlan,
  generateInlineIllustration,
  generateDraft,
  generateOutline,
  getArticle,
  markFinalDraft,
  markReadyToPublish,
  OpenAIImageInlineIllustrationClient,
  OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER,
  parseIllustrationPlanPayload,
  reviseFromDiagnosis,
  runDbsContent,
  selectAngle,
  updateIllustrationPlan,
  type InlineIllustrationClient,
  type InlineIllustrationClientInput,
  type InlineIllustrationClientResult
} from "./articles";
import {
  FakeWechatDraftClient,
  generateCoverAssets,
  listArticleAssets,
  listWechatDraftUploadImages,
  listWechatDraftUploads,
  markdownToWechatHtml,
  renderWechatHtmlAsset,
  uploadWechatDraft,
  type WechatDraftClient
} from "./publishing";
import { RealWechatDraftClient } from "./wechat-draft-client";
import { buildWechatBodyImageUploadPlan, type WechatBodyImageUploadPlan } from "./wechat-body-images";

async function createReadyArticle(db: ReturnType<typeof createTestDatabase>["db"]) {
  const article = createArticle({ topic: "跨境支付通" }, db);
  const angle = createManualAngle(article.id, { angleTitle: "速度不是重点" }, db);
  selectAngle(article.id, angle.id, db);
  const outline = await generateOutline(article.id, new FakeAIClient(), db);
  acceptOutline(article.id, outline.id, db);
  const draft = await generateDraft(article.id, new FakeAIClient(), db);
  const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
  const revision = await reviseFromDiagnosis(article.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db);
  markFinalDraft(article.id, { draftVersionId: revision.id }, db);
  markReadyToPublish(article.id, db);
  return { articleId: article.id, revision };
}

class RealisticInlineIllustrationClient extends FakeInlineIllustrationClient {
  provider = "realistic_svg_illustration";

  async generate(input: InlineIllustrationClientInput): Promise<InlineIllustrationClientResult> {
    const title = input.article.title.replace(/[<>&"]/g, "");
    return {
      content: [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
        '<rect width="1200" height="675" fill="#f7f6f2"/>',
        '<rect x="72" y="72" width="1056" height="531" rx="24" fill="#fff" stroke="#d6d1c5"/>',
        `<text x="110" y="170" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#222">${title}</text>`,
        `<text x="110" y="245" font-family="Arial, sans-serif" font-size="26" fill="#235f6d">${input.item.imageType}</text>`,
        `<text x="110" y="325" font-family="Arial, sans-serif" font-size="24" fill="#6f6a60">${input.item.purpose}</text>`,
        "</svg>"
      ].join("\n"),
      mimeType: "image/svg+xml",
      provider: this.provider,
      width: input.width,
      height: input.height,
      prompt: input.prompt
    };
  }
}

async function createReadyInlineIllustration(input: {
  db: ReturnType<typeof createTestDatabase>["db"];
  articleId: string;
  assetRoot: string;
  position: string;
  client?: InlineIllustrationClient;
}) {
  const plan = await generateIllustrationPlan(input.articleId, {}, new FakeAIClient(), input.db);
  const item = { ...parseIllustrationPlanPayload(plan.planJson).items[0], position: input.position };
  const updated = updateIllustrationPlan(
    input.articleId,
    {
      planId: plan.id,
      summaryMarkdown: plan.summaryMarkdown,
      items: [item]
    },
    input.db
  );
  const confirmed = confirmIllustrationPlan(input.articleId, { planId: updated.id }, input.db);
  const asset = await generateInlineIllustration(
    input.articleId,
    { planId: confirmed.id, planItemId: item.itemId },
    input.client || new FakeInlineIllustrationClient(),
    input.db,
    { assetRoot: input.assetRoot }
  );
  return { plan: confirmed, item, asset };
}

describe("publishing service", () => {
  it("converts basic Markdown into WeChat-friendly HTML", () => {
    const html = markdownToWechatHtml("# 标题\n\n## 小节\n- 要点\n普通段落 <script>");

    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<li");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders final draft HTML asset without changing Markdown", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId, revision } = await createReadyArticle(db);

    const asset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const assets = db.select().from(articleAssets).all();

    expect(asset.assetType).toBe("html");
    expect(asset.draftVersionId).toBe(revision.id);
    expect(fs.existsSync(asset.path)).toBe(true);
    expect(fs.readFileSync(asset.path, "utf8")).toContain("wechat-article");
    expect(assets).toHaveLength(1);
    expect(getArticle(articleId, db)?.status).toBe("publish_package_generated");
  });

  it("injects ready inline illustrations into the generated HTML", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset, item } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后"
    });

    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");

    expect(html).toContain("wechat-inline-illustration");
    expect(html).toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(html).toContain(`/api/articles/${articleId}/assets/${inlineAsset.id}/file`);
    expect(html.indexOf("速度只是表层")).toBeLessThan(html.indexOf(`data-plan-item-id="${item.itemId}"`));
    const bodyImagePlan = buildWechatBodyImageUploadPlan({
      articleId,
      html,
      assets: listArticleAssets(articleId, db)
    });
    expect(bodyImagePlan.images).toEqual([
      expect.objectContaining({
        assetId: inlineAsset.id,
        originalSrc: `/api/articles/${articleId}/assets/${inlineAsset.id}/file`,
        occurrenceCount: 1
      })
    ]);
    expect(htmlAsset.errorMessage).toContain("正文配图使用本地资产引用");
    expect(htmlAsset.errorMessage).toContain("无法直接进入公众号草稿箱");
    expect(htmlAsset.errorMessage).toContain("微信正文图片 URL");
  });

  it("injects inline illustrations when the position uses Chinese corner brackets", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset, item } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "插入在「速度只是表层」中"
    });

    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");

    expect(html).toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(html.indexOf("速度只是表层")).toBeLessThan(html.indexOf(`data-plan-item-id="${item.itemId}"`));
    expect(htmlAsset.errorMessage).not.toContain("未匹配插入位置");
  });

  it("injects inline illustrations after a paragraph fragment", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset, item } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "段落「稳定路径才会改变家庭决策」之后"
    });

    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");

    expect(html).toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(html.indexOf("稳定路径才会改变家庭决策")).toBeLessThan(html.indexOf(`data-plan-item-id="${item.itemId}"`));
    expect(htmlAsset.errorMessage).not.toContain("未匹配插入位置");
  });

  it("records a fallback warning when the paragraph anchor misses but the heading matches", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset, item } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "插入在「速度只是表层」中，段落「不存在的段落」之后"
    });

    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");

    expect(html).toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(html.indexOf("速度只是表层")).toBeLessThan(html.indexOf(`data-plan-item-id="${item.itemId}"`));
    expect(htmlAsset.errorMessage).toContain("回退锚点");
  });

  it("keeps HTML readable and records a warning when an inline illustration anchor is missing", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“不存在的小标题”之后"
    });

    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");

    expect(html).toContain("wechat-article");
    expect(html).not.toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(htmlAsset.status).toBe("ready");
    expect(htmlAsset.errorMessage).toContain("未匹配插入位置");
    expect(htmlAsset.errorMessage).toContain("配图");
    expect(getArticle(articleId, db)?.status).toBe("publish_package_generated");
  });

  it("rejects HTML rendering before final draft is marked ready", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "还没有最终稿" }, db);

    expect(() => renderWechatHtmlAsset(article.id, db)).toThrow("请先标记最终稿");
  });

  it("generates two default cover assets after HTML", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    renderWechatHtmlAsset(articleId, db, { assetRoot });

    const covers = generateCoverAssets(articleId, {}, db, { assetRoot });

    expect(covers).toHaveLength(2);
    expect(covers.map((cover) => cover.variant)).toEqual(["wechat_21_9", "wechat_1_1"]);
    expect(covers.every((cover) => fs.existsSync(cover.path))).toBe(true);
    expect(listArticleAssets(articleId, db).filter((asset) => asset.assetType === "cover")).toHaveLength(2);
    expect(getArticle(articleId, db)?.status).toBe("cover_generated");
  });

  it("rejects WeChat draft upload before HTML and covers exist", async () => {
    const { db } = createTestDatabase();
    const { articleId } = await createReadyArticle(db);

    await expect(uploadWechatDraft(articleId, new FakeWechatDraftClient(), db)).rejects.toThrow("请先生成 HTML 和封面");
  });

  it("uploads draft through fake adapter and records the result", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, { filename: "source.png", mimeType: "image/png", buffer: Buffer.from("fake") }, db, { assetRoot });

    const upload = await uploadWechatDraft(articleId, new FakeWechatDraftClient(), db);
    const uploads = listWechatDraftUploads(articleId, db);

    expect(upload.status).toBe("success");
    expect(upload.wechatMediaId).toContain("fake_media_");
    expect(uploads).toHaveLength(1);
    expect(db.select().from(wechatDraftUploads).all()).toHaveLength(1);
    expect(listWechatDraftUploadImages(articleId, db)).toHaveLength(0);
    expect(getArticle(articleId, db)?.status).toBe("uploaded_to_draft_box");
  });

  it("passes the prepared body image plan to the WeChat draft adapter", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, { filename: "source.png", mimeType: "image/png", buffer: Buffer.from("fake") }, db, { assetRoot });
    const receivedPlans: WechatBodyImageUploadPlan[] = [];
    const inspectingClient: WechatDraftClient = {
      async uploadDraft(input) {
        receivedPlans.push(input.bodyImagePlan);
        return { mediaId: "media-with-plan" };
      }
    };

    const upload = await uploadWechatDraft(articleId, inspectingClient, db);

    expect(upload.status).toBe("success");
    expect(receivedPlans).toHaveLength(1);
    expect(receivedPlans[0]?.summary).toMatchObject({
      totalImageTags: 0,
      localImageCount: 0,
      uploadableImageCount: 0,
      issueCount: 0
    });
  });

  it("blocks WeChat draft upload when generated HTML contains inline illustration warnings", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后"
    });
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, {}, db, { assetRoot });

    const uploadAttempt = uploadWechatDraft(articleId, new FakeWechatDraftClient(), db);

    await expect(uploadAttempt).rejects.toThrow("发布包存在正文配图处理提示");
    await expect(uploadAttempt).rejects.toThrow("微信正文图片 URL");
    expect(db.select().from(wechatDraftUploads).all()).toHaveLength(0);
    expect(getArticle(articleId, db)?.status).toBe("cover_generated");
  });

  it("allows a body-image-capable adapter to handle local inline illustration warnings", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后",
      client: new RealisticInlineIllustrationClient()
    });
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, {}, db, { assetRoot });
    const bodyImageClient: WechatDraftClient = {
      supportsBodyImageUpload: true,
      async uploadDraft(input) {
        expect(input.bodyImagePlan.images).toEqual([
          expect.objectContaining({
            assetId: inlineAsset.id,
            originalSrc: `/api/articles/${articleId}/assets/${inlineAsset.id}/file`
          })
        ]);
        const image = input.bodyImagePlan.images[0];
        if (!image) {
          throw new Error("missing body image plan item");
        }
        return {
          mediaId: "media-with-body-image",
          bodyImageUploads: [
            {
              assetId: image.assetId,
              sourcePlanId: image.sourcePlanId,
              sourcePlanItemId: image.sourcePlanItemId,
              originalSrc: image.originalSrc,
              wechatUrl: "https://mmbiz.qpic.cn/body-image.png",
              status: "success",
              occurrenceCount: image.occurrenceCount,
              altTexts: image.altTexts
            }
          ]
        };
      }
    };

    const upload = await uploadWechatDraft(articleId, bodyImageClient, db);
    const imageUploads = listWechatDraftUploadImages(articleId, db);

    expect(upload.status).toBe("success");
    expect(upload.wechatMediaId).toBe("media-with-body-image");
    expect(imageUploads).toEqual([
      expect.objectContaining({
        uploadId: upload.id,
        articleId,
        draftVersionId: upload.draftVersionId,
        htmlAssetId: upload.htmlAssetId,
        assetId: inlineAsset.id,
        originalSrc: `/api/articles/${articleId}/assets/${inlineAsset.id}/file`,
        wechatUrl: "https://mmbiz.qpic.cn/body-image.png",
        status: "success",
        occurrenceCount: 1,
        altTextsJson: expect.stringContaining("到账速度")
      })
    ]);
    expect(db.select().from(wechatDraftUploadImages).all()).toHaveLength(1);
    expect(getArticle(articleId, db)?.status).toBe("uploaded_to_draft_box");
  });

  it("blocks placeholder inline illustrations before official WeChat draft upload", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后"
    });
    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, {}, db, { assetRoot });
    const bodyImageClient: WechatDraftClient = {
      supportsBodyImageUpload: true,
      async uploadDraft() {
        return { mediaId: "should-not-upload" };
      }
    };

    const uploadAttempt = uploadWechatDraft(articleId, bodyImageClient, db);

    expect(htmlAsset.errorMessage).toContain("测试占位图");
    await expect(uploadAttempt).rejects.toThrow("发布包存在正文配图处理提示");
    await expect(uploadAttempt).rejects.toThrow("测试占位图");
    expect(db.select().from(wechatDraftUploads).all()).toHaveLength(0);
    expect(getArticle(articleId, db)?.status).toBe("cover_generated");
  });

  it("locally smokes the real WeChat draft client with SVG covers and inline illustrations through mocked HTTP", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后",
      client: new RealisticInlineIllustrationClient()
    });
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    const covers = generateCoverAssets(articleId, {}, db, { assetRoot });
    const uploadFilenames: string[] = [];
    let draftBody = "";
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token?")) {
        return new Response(JSON.stringify({ access_token: "local-token" }), { status: 200 });
      }
      if (url.includes("/material/add_material") || url.includes("/media/uploadimg")) {
        const media = (init?.body as FormData | undefined)?.get("media") as File | null;
        uploadFilenames.push(media?.name || "");
        if (url.includes("/material/add_material")) {
          return new Response(JSON.stringify({ media_id: "local-thumb-media" }), { status: 200 });
        }
        return new Response(JSON.stringify({ url: "https://mmbiz.qpic.cn/local-body-image.png" }), { status: 200 });
      }
      if (url.includes("/draft/add")) {
        draftBody = String(init?.body || "");
        return new Response(JSON.stringify({ media_id: "local-draft-media" }), { status: 200 });
      }
      throw new Error(`Unexpected local smoke URL: ${url}`);
    };
    const client = new RealWechatDraftClient({ appId: "local-app", appSecret: "local-secret", fetchImpl });

    const upload = await uploadWechatDraft(articleId, client, db);
    const imageUploads = listWechatDraftUploadImages(articleId, db);

    expect(upload.status).toBe("success");
    expect(upload.wechatMediaId).toBe("local-draft-media");
    expect(uploadFilenames).toHaveLength(2);
    expect(uploadFilenames.every((filename) => filename.endsWith(".wechat-upload.png"))).toBe(true);
    expect(fs.existsSync(covers[0].path.replace(/\.svg$/, ".wechat-upload.png"))).toBe(true);
    expect(fs.existsSync(inlineAsset.path.replace(/\.svg$/, ".wechat-upload.png"))).toBe(true);
    expect(draftBody).toContain("local-thumb-media");
    expect(draftBody).toContain("https://mmbiz.qpic.cn/local-body-image.png");
    expect(draftBody).not.toContain(`/api/articles/${articleId}/assets/${inlineAsset.id}/file`);
    expect(imageUploads).toEqual([
      expect.objectContaining({
        uploadId: upload.id,
        assetId: inlineAsset.id,
        wechatUrl: "https://mmbiz.qpic.cn/local-body-image.png",
        status: "success"
      })
    ]);
    expect(getArticle(articleId, db)?.status).toBe("uploaded_to_draft_box");
  });

  it("carries a real image provider PNG asset through HTML preview and WeChat body image upload", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const imageProvider = new OpenAIImageInlineIllustrationClient({
      apiKey: "local-image-key",
      model: "local-image-model",
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{ b64_json: pngBase64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    });
    const { asset: inlineAsset } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后",
      client: imageProvider
    });
    const htmlAsset = renderWechatHtmlAsset(articleId, db, { assetRoot });
    const html = fs.readFileSync(htmlAsset.path, "utf8");
    const covers = generateCoverAssets(articleId, {}, db, { assetRoot });
    const uploadCalls: { url: string; filename: string }[] = [];
    let draftBody = "";
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token?")) {
        return new Response(JSON.stringify({ access_token: "local-token" }), { status: 200 });
      }
      if (url.includes("/material/add_material") || url.includes("/media/uploadimg")) {
        const media = (init?.body as FormData | undefined)?.get("media") as File | null;
        uploadCalls.push({ url, filename: media?.name || "" });
        if (url.includes("/material/add_material")) {
          return new Response(JSON.stringify({ media_id: "local-thumb-media" }), { status: 200 });
        }
        return new Response(JSON.stringify({ url: "https://mmbiz.qpic.cn/real-provider-body-image.png" }), { status: 200 });
      }
      if (url.includes("/draft/add")) {
        draftBody = String(init?.body || "");
        return new Response(JSON.stringify({ media_id: "local-draft-media" }), { status: 200 });
      }
      throw new Error(`Unexpected real provider smoke URL: ${url}`);
    };
    const client = new RealWechatDraftClient({ appId: "local-app", appSecret: "local-secret", fetchImpl });

    expect(inlineAsset.provider).toBe(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER);
    expect(inlineAsset.mimeType).toBe("image/png");
    expect(inlineAsset.path).toMatch(/\.png$/);
    expect(html).toContain(`data-asset-id="${inlineAsset.id}"`);
    expect(html).toContain(`/api/articles/${articleId}/assets/${inlineAsset.id}/file`);
    expect(htmlAsset.errorMessage).toContain("正文配图使用本地资产引用");
    expect(htmlAsset.errorMessage).not.toContain("测试占位图");

    const upload = await uploadWechatDraft(articleId, client, db);
    const imageUploads = listWechatDraftUploadImages(articleId, db);
    const storedInlineAsset = listArticleAssets(articleId, db).find((asset) => asset.id === inlineAsset.id);

    expect(upload.status).toBe("success");
    expect(upload.wechatMediaId).toBe("local-draft-media");
    expect(uploadCalls).toHaveLength(2);
    expect(uploadCalls.find((call) => call.url.includes("/material/add_material"))?.filename).toBe("wechat_21_9.wechat-upload.png");
    expect(uploadCalls.find((call) => call.url.includes("/media/uploadimg"))?.filename).toBe(path.basename(inlineAsset.path));
    expect(fs.existsSync(covers[0].path.replace(/\.svg$/, ".wechat-upload.png"))).toBe(true);
    expect(inlineAsset.path.endsWith(".wechat-upload.png")).toBe(false);
    expect(draftBody).toContain("https://mmbiz.qpic.cn/real-provider-body-image.png");
    expect(draftBody).not.toContain(`/api/articles/${articleId}/assets/${inlineAsset.id}/file`);
    expect(storedInlineAsset?.provider).toBe(OPENAI_IMAGE_INLINE_ILLUSTRATION_PROVIDER);
    expect(imageUploads).toEqual([
      expect.objectContaining({
        uploadId: upload.id,
        assetId: inlineAsset.id,
        originalSrc: `/api/articles/${articleId}/assets/${inlineAsset.id}/file`,
        wechatUrl: "https://mmbiz.qpic.cn/real-provider-body-image.png",
        status: "success"
      })
    ]);
    expect(getArticle(articleId, db)?.status).toBe("uploaded_to_draft_box");
  });

  it("records adapter failures without advancing status", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    renderWechatHtmlAsset(articleId, db, { assetRoot });
    generateCoverAssets(articleId, {}, db, { assetRoot });
    const failingClient: WechatDraftClient = {
      async uploadDraft() {
        throw new Error("微信接口失败");
      }
    };

    const upload = await uploadWechatDraft(articleId, failingClient, db);

    expect(upload.status).toBe("failed");
    expect(upload.errorMessage).toBe("微信接口失败");
    expect(getArticle(articleId, db)?.status).toBe("cover_generated");
  });
});
