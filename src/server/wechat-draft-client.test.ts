import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ArticleAsset, ArticleProject, DraftVersion } from "@/db/schema";

import { buildWechatBodyImageUploadPlan } from "./wechat-body-images";
import { RealWechatDraftClient } from "./wechat-draft-client";

function article(overrides: Partial<ArticleProject> = {}): ArticleProject {
  return {
    id: "article-1",
    ownerId: "owner-1",
    title: "香港账户还能不能开？",
    topic: "香港账户还能不能开？真正变了的不是开户，是资金路径",
    status: "cover_generated",
    topicType: null,
    targetReader: null,
    coreProblem: null,
    hotAnchor: null,
    selectedAngleId: null,
    finalDraftVersionId: "draft-1",
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

function draft(overrides: Partial<DraftVersion> = {}): DraftVersion {
  return {
    id: "draft-1",
    articleId: "article-1",
    ownerId: "owner-1",
    versionNo: 3,
    draftType: "final",
    markdown: "# 香港账户还能不能开？",
    html: null,
    sourceOutlineId: null,
    sourceDiagnosisId: null,
    sourceInvocationId: null,
    sourceAIStyleCheckId: null,
    createdBy: "user",
    isFinal: true,
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

function asset(overrides: Partial<ArticleAsset>): ArticleAsset {
  return {
    id: "asset-1",
    articleId: "article-1",
    ownerId: "owner-1",
    draftVersionId: "draft-1",
    sourcePlanId: null,
    sourcePlanItemId: null,
    assetType: "inline_illustration",
    status: "ready",
    variant: null,
    path: "/tmp/asset-1.png",
    mimeType: "image/png",
    source: null,
    promptSnapshot: null,
    provider: null,
    errorMessage: null,
    width: null,
    height: null,
    generatedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("RealWechatDraftClient", () => {
  it("uploads thumb and body images, replaces local image srcs, then creates a draft", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-real-client-"));
    const cover = path.join(dir, "cover.png");
    const bodyImage = path.join(dir, "body.png");
    const htmlAssetPath = path.join(dir, "draft.html");
    fs.writeFileSync(cover, "cover");
    fs.writeFileSync(bodyImage, "body");
    fs.writeFileSync(htmlAssetPath, "<article>draft</article>");
    const localSrc = "/api/articles/article-1/assets/asset-1/file";
    const bodyHtml = `<article><p>正文</p><img src="${localSrc}" alt="路径图" /></article>`;
    const bodyImagePlan = buildWechatBodyImageUploadPlan({
      articleId: "article-1",
      html: bodyHtml,
      assets: [asset({ id: "asset-1", path: bodyImage })]
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/token?")) {
        return jsonResponse({ access_token: "token-1" });
      }
      if (url.includes("/material/add_material")) {
        return jsonResponse({ media_id: "thumb-media-1" });
      }
      if (url.includes("/media/uploadimg")) {
        return jsonResponse({ url: "https://mmbiz.qpic.cn/body-1.png" });
      }
      if (url.includes("/draft/add")) {
        expect(init?.method).toBe("POST");
        expect(String(init?.body)).toContain("thumb-media-1");
        expect(String(init?.body)).toContain("https://mmbiz.qpic.cn/body-1.png");
        expect(String(init?.body)).not.toContain(localSrc);
        return jsonResponse({ media_id: "draft-media-1" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const client = new RealWechatDraftClient({
      appId: "app-id",
      appSecret: "secret",
      author: "华叔",
      fetchImpl
    });

    const result = await client.uploadDraft({
      article: article(),
      draft: draft(),
      htmlAsset: asset({ id: "html-1", assetType: "html", path: htmlAssetPath, mimeType: "text/html" }),
      bodyHtml,
      bodyImagePlan,
      coverAssets: [asset({ id: "cover-1", assetType: "cover", path: cover, mimeType: "image/png" })]
    });

    expect(result.mediaId).toBe("draft-media-1");
    expect(result.bodyImageUploads).toEqual([
      expect.objectContaining({
        assetId: "asset-1",
        originalSrc: localSrc,
        wechatUrl: "https://mmbiz.qpic.cn/body-1.png",
        status: "success",
        occurrenceCount: 1,
        altTexts: ["路径图"]
      })
    ]);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/cgi-bin/token",
      "/cgi-bin/material/add_material",
      "/cgi-bin/media/uploadimg",
      "/cgi-bin/draft/add"
    ]);
  });

  it("skips body upload when HTML has no local body images", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-real-client-"));
    const cover = path.join(dir, "cover.png");
    const htmlAssetPath = path.join(dir, "draft.html");
    fs.writeFileSync(cover, "cover");
    fs.writeFileSync(htmlAssetPath, "<article>draft</article>");
    const bodyHtml = "<article><p>正文</p></article>";
    const bodyImagePlan = buildWechatBodyImageUploadPlan({ articleId: "article-1", html: bodyHtml, assets: [] });
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/token?")) {
        return jsonResponse({ access_token: "token-1" });
      }
      if (url.includes("/material/add_material")) {
        return jsonResponse({ media_id: "thumb-media-1" });
      }
      if (url.includes("/draft/add")) {
        expect(String(init?.body)).toContain("正文");
        return jsonResponse({ media_id: "draft-media-1" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const client = new RealWechatDraftClient({ appId: "app-id", appSecret: "secret", fetchImpl });

    const result = await client.uploadDraft({
      article: article(),
      draft: draft(),
      htmlAsset: asset({ id: "html-1", assetType: "html", path: htmlAssetPath, mimeType: "text/html" }),
      bodyHtml,
      bodyImagePlan,
      coverAssets: [asset({ id: "cover-1", assetType: "cover", path: cover, mimeType: "image/png" })]
    });

    expect(result.mediaId).toBe("draft-media-1");
    expect(result.bodyImageUploads).toEqual([]);
    expect(calls.some((url) => url.includes("/media/uploadimg"))).toBe(false);
  });

  it("prepares SVG cover and body images as PNG derivatives before upload", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-real-client-"));
    const cover = path.join(dir, "cover.svg");
    const bodyImage = path.join(dir, "body.svg");
    const htmlAssetPath = path.join(dir, "draft.html");
    fs.writeFileSync(cover, '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="386"></svg>');
    fs.writeFileSync(bodyImage, '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"></svg>');
    fs.writeFileSync(htmlAssetPath, "<article>draft</article>");
    const localSrc = "/api/articles/article-1/assets/asset-1/file";
    const bodyHtml = `<article><img src="${localSrc}" alt="路径图" /></article>`;
    const bodyImagePlan = buildWechatBodyImageUploadPlan({
      articleId: "article-1",
      html: bodyHtml,
      assets: [asset({ id: "asset-1", path: bodyImage, mimeType: "image/svg+xml", width: 1200, height: 675 })]
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token?")) {
        return jsonResponse({ access_token: "token-1" });
      }
      if (url.includes("/material/add_material")) {
        return jsonResponse({ media_id: "thumb-media-1" });
      }
      if (url.includes("/media/uploadimg")) {
        return jsonResponse({ url: "https://mmbiz.qpic.cn/body-1.png" });
      }
      if (url.includes("/draft/add")) {
        return jsonResponse({ media_id: "draft-media-1" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const client = new RealWechatDraftClient({ appId: "app-id", appSecret: "secret", fetchImpl });

    const result = await client.uploadDraft({
      article: article(),
      draft: draft(),
      htmlAsset: asset({ id: "html-1", assetType: "html", path: htmlAssetPath, mimeType: "text/html" }),
      bodyHtml,
      bodyImagePlan,
      coverAssets: [asset({ id: "cover-1", assetType: "cover", path: cover, mimeType: "image/svg+xml", width: 900, height: 386 })]
    });

    expect(result.mediaId).toBe("draft-media-1");
    expect(fs.existsSync(path.join(dir, "cover.wechat-upload.png"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "body.wechat-upload.png"))).toBe(true);
  });

  it("turns WeChat API errors into readable adapter errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errcode: 40164, errmsg: "invalid ip" })) as unknown as typeof fetch;
    const client = new RealWechatDraftClient({ appId: "app-id", appSecret: "secret", fetchImpl });

    await expect(
      client.uploadDraft({
        article: article(),
        draft: draft(),
        htmlAsset: asset({ id: "html-1", assetType: "html", path: "/tmp/draft.html", mimeType: "text/html" }),
        bodyHtml: "<article>正文</article>",
        bodyImagePlan: buildWechatBodyImageUploadPlan({ articleId: "article-1", html: "<article>正文</article>", assets: [] }),
        coverAssets: [asset({ id: "cover-1", assetType: "cover", path: "/tmp/cover.png", mimeType: "image/png" })]
      })
    ).rejects.toThrow("微信接口失败：invalid ip (40164)");
  });

  it("fails before network calls when the prepared body image plan has issues", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "token-1" })) as unknown as typeof fetch;
    const client = new RealWechatDraftClient({ appId: "app-id", appSecret: "secret", fetchImpl });
    const bodyImagePlan = buildWechatBodyImageUploadPlan({
      articleId: "article-1",
      html: '<article><img src="/api/articles/article-1/assets/missing/file" /></article>',
      assets: []
    });

    await expect(
      client.uploadDraft({
        article: article(),
        draft: draft(),
        htmlAsset: asset({ id: "html-1", assetType: "html", path: "/tmp/draft.html", mimeType: "text/html" }),
        bodyHtml: bodyImagePlan.html,
        bodyImagePlan,
        coverAssets: [asset({ id: "cover-1", assetType: "cover", path: "/tmp/cover.png", mimeType: "image/png" })]
      })
    ).rejects.toThrow("正文图片上传准备失败");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
