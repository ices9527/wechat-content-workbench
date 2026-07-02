import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import type { ArticleAsset } from "@/db/schema";

export type PreparedWechatUploadAsset = {
  filePath: string;
  mimeType: "image/png" | "image/jpeg";
  derived: boolean;
};

export type WechatUploadFileInput = {
  filePath: string;
  mimeType: string | null | undefined;
  width?: number | null;
  height?: number | null;
};

const SUPPORTED_UPLOAD_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function normalizedMimeType(input: WechatUploadFileInput): string {
  return (input.mimeType || path.extname(input.filePath).replace(".", "image/")).toLowerCase();
}

function isSvgFile(input: WechatUploadFileInput): boolean {
  return normalizedMimeType(input) === "image/svg+xml" || path.extname(input.filePath).toLowerCase() === ".svg";
}

function derivativePngPath(assetPath: string): string {
  const parsed = path.parse(assetPath);
  return path.join(parsed.dir, `${parsed.name}.wechat-upload.png`);
}

function uploadDimensions(input: WechatUploadFileInput): { width?: number; height?: number } {
  const width = input.width ? Math.max(1, Math.min(Math.round(input.width), 1600)) : undefined;
  const height = input.height ? Math.max(1, Math.min(Math.round(input.height), 1600)) : undefined;
  return { width, height };
}

export async function prepareWechatUploadFile(input: WechatUploadFileInput): Promise<PreparedWechatUploadAsset> {
  if (!fs.existsSync(input.filePath)) {
    throw new Error(`微信上传文件不存在：${input.filePath}`);
  }

  const mimeType = normalizedMimeType(input);
  if (SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return {
      filePath: input.filePath,
      mimeType: mimeType === "image/jpg" ? "image/jpeg" : (mimeType as "image/png" | "image/jpeg"),
      derived: false
    };
  }

  if (isSvgFile(input)) {
    const filePath = derivativePngPath(input.filePath);
    const dimensions = uploadDimensions(input);
    let image = sharp(input.filePath);
    if (dimensions.width || dimensions.height) {
      image = image.resize({ ...dimensions, fit: "fill" });
    }
    await image.png().toFile(filePath);
    return { filePath, mimeType: "image/png", derived: true };
  }

  throw new Error(`微信上传仅支持 PNG/JPG；当前文件类型：${input.mimeType || path.extname(input.filePath) || "未知"}`);
}

export async function prepareWechatUploadAsset(asset: ArticleAsset): Promise<PreparedWechatUploadAsset> {
  return prepareWechatUploadFile({
    filePath: asset.path,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height
  });
}
