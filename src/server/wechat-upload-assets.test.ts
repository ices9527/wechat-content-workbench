import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ArticleAsset } from "@/db/schema";

import { prepareWechatUploadAsset } from "./wechat-upload-assets";

function asset(overrides: Partial<ArticleAsset>): ArticleAsset {
  return {
    id: "asset-1",
    articleId: "article-1",
    ownerId: "owner-1",
    draftVersionId: "draft-1",
    sourcePlanId: null,
    sourcePlanItemId: null,
    assetType: "cover",
    status: "ready",
    variant: "wechat_21_9",
    path: "/tmp/asset.svg",
    mimeType: "image/svg+xml",
    source: null,
    promptSnapshot: null,
    provider: null,
    errorMessage: null,
    width: 900,
    height: 386,
    generatedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

describe("wechat upload asset preparation", () => {
  it("renders an uploadable PNG derivative for SVG assets without changing the original", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-upload-asset-"));
    const svgPath = path.join(dir, "cover.svg");
    fs.writeFileSync(
      svgPath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#235f6d"/></svg>'
    );

    const prepared = await prepareWechatUploadAsset(asset({ path: svgPath, width: 120, height: 80 }));
    const metadata = await sharp(prepared.filePath).metadata();

    expect(prepared.mimeType).toBe("image/png");
    expect(prepared.filePath).toBe(path.join(dir, "cover.wechat-upload.png"));
    expect(fs.existsSync(svgPath)).toBe(true);
    expect(metadata.width).toBe(120);
    expect(metadata.height).toBe(80);
    expect(fs.readFileSync(prepared.filePath).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  it("uses existing PNG/JPEG files directly", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-upload-asset-"));
    const pngPath = path.join(dir, "cover.png");
    fs.writeFileSync(pngPath, Buffer.from("fake png bytes"));

    const prepared = await prepareWechatUploadAsset(asset({ path: pngPath, mimeType: "image/png" }));

    expect(prepared).toEqual({ filePath: pngPath, mimeType: "image/png", derived: false });
  });

  it("rejects unsupported image formats before calling WeChat", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-upload-asset-"));
    const pdfPath = path.join(dir, "cover.pdf");
    fs.writeFileSync(pdfPath, "%PDF");

    await expect(prepareWechatUploadAsset(asset({ path: pdfPath, mimeType: "application/pdf" }))).rejects.toThrow(
      "微信上传仅支持 PNG/JPG"
    );
  });
});
