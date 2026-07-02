import fs from "node:fs";

import type { ArticleAsset } from "@/db/schema";

export type WechatBodyImageUploadIssueReason = "asset_not_found" | "file_missing";

export type WechatBodyImageUploadItem = {
  originalSrc: string;
  articleId: string;
  assetId: string;
  assetPath: string;
  mimeType: string | null;
  sourcePlanId: string | null;
  sourcePlanItemId: string | null;
  width: number | null;
  height: number | null;
  altTexts: string[];
  occurrenceCount: number;
};

export type WechatBodyImageUploadIssue = {
  originalSrc: string;
  articleId: string | null;
  assetId: string | null;
  reason: WechatBodyImageUploadIssueReason;
  message: string;
};

export type WechatBodyImageUploadPlan = {
  html: string;
  images: WechatBodyImageUploadItem[];
  issues: WechatBodyImageUploadIssue[];
  skippedExternalSrcs: string[];
  summary: {
    totalImageTags: number;
    localImageCount: number;
    uploadableImageCount: number;
    issueCount: number;
    skippedExternalCount: number;
  };
};

export type WechatBodyImageReplacement = {
  originalSrc: string;
  wechatUrl: string;
};

export type WechatBodyImageUploadResultItem = {
  assetId: string;
  sourcePlanId: string | null;
  sourcePlanItemId: string | null;
  originalSrc: string;
  wechatUrl: string | null;
  status: "success" | "failed";
  errorMessage?: string | null;
  occurrenceCount: number;
  altTexts: string[];
};

export type WechatBodyImageReplacementResult = {
  html: string;
  unusedReplacementSrcs: string[];
  summary: {
    requestedReplacementCount: number;
    replacedImageCount: number;
    unusedReplacementCount: number;
  };
};

type HtmlImage = {
  tag: string;
  src: string;
  alt: string | null;
};

type LocalArticleImageSrc = {
  articleId: string;
  assetId: string;
};

const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;
const ATTRIBUTE_PATTERN = /\s([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function extractAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name) {
      attributes[name] = decodeHtmlAttribute(value);
    }
  }
  return attributes;
}

function extractImages(html: string): HtmlImage[] {
  return Array.from(html.matchAll(IMG_TAG_PATTERN)).flatMap((match) => {
    const tag = match[0];
    const attributes = extractAttributes(tag);
    if (!attributes.src) {
      return [];
    }
    return [
      {
        tag,
        src: attributes.src,
        alt: attributes.alt || null
      }
    ];
  });
}

export function parseLocalArticleAssetImageSrc(src: string): LocalArticleImageSrc | null {
  let pathname = src;
  try {
    pathname = new URL(src, "http://local.workbench").pathname;
  } catch {
    pathname = src.split(/[?#]/, 1)[0] || src;
  }

  const segments = pathname.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  if (apiIndex < 0) {
    return null;
  }
  const localSegments = segments.slice(apiIndex);
  if (
    localSegments.length === 6 &&
    localSegments[0] === "api" &&
    localSegments[1] === "articles" &&
    localSegments[3] === "assets" &&
    localSegments[5] === "file"
  ) {
    return {
      articleId: decodeURIComponent(localSegments[2]),
      assetId: decodeURIComponent(localSegments[4])
    };
  }
  return null;
}

export function buildWechatBodyImageUploadPlan(input: {
  articleId: string;
  html: string;
  assets: ArticleAsset[];
  fileExists?: (filePath: string) => boolean;
}): WechatBodyImageUploadPlan {
  const fileExists = input.fileExists || fs.existsSync;
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const imagesBySrc = new Map<string, WechatBodyImageUploadItem>();
  const issues: WechatBodyImageUploadIssue[] = [];
  const skippedExternalSrcs: string[] = [];
  let localImageCount = 0;

  for (const image of extractImages(input.html)) {
    const localImage = parseLocalArticleAssetImageSrc(image.src);
    if (!localImage || localImage.articleId !== input.articleId) {
      skippedExternalSrcs.push(image.src);
      continue;
    }
    localImageCount += 1;

    const asset = assetsById.get(localImage.assetId);
    if (!asset) {
      issues.push({
        originalSrc: image.src,
        articleId: localImage.articleId,
        assetId: localImage.assetId,
        reason: "asset_not_found",
        message: `正文图片资产不存在：${localImage.assetId}`
      });
      continue;
    }

    if (!fileExists(asset.path)) {
      issues.push({
        originalSrc: image.src,
        articleId: localImage.articleId,
        assetId: localImage.assetId,
        reason: "file_missing",
        message: `正文图片文件不存在：${asset.path}`
      });
      continue;
    }

    const existing = imagesBySrc.get(image.src);
    if (existing) {
      existing.occurrenceCount += 1;
      if (image.alt && !existing.altTexts.includes(image.alt)) {
        existing.altTexts.push(image.alt);
      }
      continue;
    }

    imagesBySrc.set(image.src, {
      originalSrc: image.src,
      articleId: localImage.articleId,
      assetId: asset.id,
      assetPath: asset.path,
      mimeType: asset.mimeType,
      sourcePlanId: asset.sourcePlanId,
      sourcePlanItemId: asset.sourcePlanItemId,
      width: asset.width,
      height: asset.height,
      altTexts: image.alt ? [image.alt] : [],
      occurrenceCount: 1
    });
  }

  const images = Array.from(imagesBySrc.values());
  return {
    html: input.html,
    images,
    issues,
    skippedExternalSrcs,
    summary: {
      totalImageTags: extractImages(input.html).length,
      localImageCount,
      uploadableImageCount: images.length,
      issueCount: issues.length,
      skippedExternalCount: skippedExternalSrcs.length
    }
  };
}

export function replaceWechatBodyImageUrls(
  html: string,
  replacements: WechatBodyImageReplacement[]
): WechatBodyImageReplacementResult {
  let nextHtml = html;
  const unusedReplacementSrcs: string[] = [];
  let replacedImageCount = 0;

  for (const replacement of replacements) {
    const srcPattern = new RegExp(`(\\bsrc\\s*=\\s*)(["'])${escapeRegExp(replacement.originalSrc)}\\2`, "g");
    let currentReplacementCount = 0;
    nextHtml = nextHtml.replace(srcPattern, (_match, prefix: string, quote: string) => {
      currentReplacementCount += 1;
      replacedImageCount += 1;
      return `${prefix}${quote}${escapeHtmlAttribute(replacement.wechatUrl)}${quote}`;
    });
    if (currentReplacementCount === 0) {
      unusedReplacementSrcs.push(replacement.originalSrc);
    }
  }

  return {
    html: nextHtml,
    unusedReplacementSrcs,
    summary: {
      requestedReplacementCount: replacements.length,
      replacedImageCount,
      unusedReplacementCount: unusedReplacementSrcs.length
    }
  };
}
