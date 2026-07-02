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
  parseIllustrationPlanPayload,
  reviseFromDiagnosis,
  runDbsContent,
  selectAngle,
  updateIllustrationPlan
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

async function createReadyInlineIllustration(input: {
  db: ReturnType<typeof createTestDatabase>["db"];
  articleId: string;
  assetRoot: string;
  position: string;
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
    new FakeInlineIllustrationClient(),
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
      position: "放在“速度只是表层”之后"
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

  it("locally smokes the real WeChat draft client with SVG covers and inline illustrations through mocked HTTP", async () => {
    const { db } = createTestDatabase();
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-assets-"));
    const { articleId } = await createReadyArticle(db);
    const { asset: inlineAsset } = await createReadyInlineIllustration({
      db,
      articleId,
      assetRoot,
      position: "放在“速度只是表层”之后"
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
