import { describe, expect, it } from "vitest";

import type { ArticleAsset } from "@/db/schema";

import { buildWechatBodyImageUploadPlan, replaceWechatBodyImageUrls } from "./wechat-body-images";

function asset(overrides: Partial<ArticleAsset>): ArticleAsset {
  return {
    id: "asset-1",
    articleId: "article-1",
    ownerId: "owner-1",
    draftVersionId: "draft-1",
    sourcePlanId: "plan-1",
    sourcePlanItemId: "item-1",
    assetType: "inline_illustration",
    status: "ready",
    variant: "body",
    path: "/tmp/asset-1.png",
    mimeType: "image/png",
    source: "generated",
    promptSnapshot: null,
    provider: "fake",
    errorMessage: null,
    width: 900,
    height: 600,
    generatedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

describe("wechat body image upload plan", () => {
  it("collects unique local article images and keeps occurrence counts", () => {
    const localSrc = "/api/articles/article-1/assets/asset-1/file";
    const html = [
      '<article>',
      `<img src="${localSrc}" alt="边界图" />`,
      '<img src="https://example.com/external.png" alt="外部图" />',
      `<img alt="重复图" src="${localSrc}" />`,
      "</article>"
    ].join("\n");

    const plan = buildWechatBodyImageUploadPlan({
      articleId: "article-1",
      html,
      assets: [asset({})],
      fileExists: () => true
    });

    expect(plan.images).toHaveLength(1);
    expect(plan.images[0]).toMatchObject({
      assetId: "asset-1",
      originalSrc: localSrc,
      assetPath: "/tmp/asset-1.png",
      mimeType: "image/png",
      occurrenceCount: 2,
      altTexts: ["边界图", "重复图"]
    });
    expect(plan.skippedExternalSrcs).toEqual(["https://example.com/external.png"]);
    expect(plan.summary).toMatchObject({
      totalImageTags: 3,
      localImageCount: 2,
      uploadableImageCount: 1,
      issueCount: 0,
      skippedExternalCount: 1
    });
  });

  it("records local image issues when assets or files are missing", () => {
    const html = [
      '<article>',
      '<img src="/api/articles/article-1/assets/missing-asset/file" />',
      '<img src="/api/articles/article-1/assets/missing-file/file" />',
      "</article>"
    ].join("\n");

    const plan = buildWechatBodyImageUploadPlan({
      articleId: "article-1",
      html,
      assets: [asset({ id: "missing-file", path: "/tmp/missing-file.png" })],
      fileExists: () => false
    });

    expect(plan.images).toHaveLength(0);
    expect(plan.issues).toEqual([
      expect.objectContaining({ assetId: "missing-asset", reason: "asset_not_found" }),
      expect.objectContaining({ assetId: "missing-file", reason: "file_missing" })
    ]);
    expect(plan.summary).toMatchObject({
      localImageCount: 2,
      uploadableImageCount: 0,
      issueCount: 2
    });
  });

  it("replaces local image src values with uploaded WeChat URLs", () => {
    const html = [
      '<article>',
      '<img src="/api/articles/article-1/assets/asset-1/file" alt="边界图" />',
      '<img src="https://example.com/external.png" alt="外部图" />',
      "</article>"
    ].join("\n");

    const result = replaceWechatBodyImageUrls(html, [
      {
        originalSrc: "/api/articles/article-1/assets/asset-1/file",
        wechatUrl: "https://mmbiz.qpic.cn/sz_mmbiz_png/demo.png?wx_fmt=png&from=appmsg"
      },
      {
        originalSrc: "/api/articles/article-1/assets/unused/file",
        wechatUrl: "https://mmbiz.qpic.cn/unused.png"
      }
    ]);

    expect(result.html).toContain(
      'src="https://mmbiz.qpic.cn/sz_mmbiz_png/demo.png?wx_fmt=png&amp;from=appmsg"'
    );
    expect(result.html).toContain('src="https://example.com/external.png"');
    expect(result.summary).toMatchObject({
      requestedReplacementCount: 2,
      replacedImageCount: 1,
      unusedReplacementCount: 1
    });
    expect(result.unusedReplacementSrcs).toEqual(["/api/articles/article-1/assets/unused/file"]);
  });
});
