import fs from "node:fs";
import path from "node:path";

import type { ArticleAsset, ArticleProject, DraftVersion } from "@/db/schema";

import {
  replaceWechatBodyImageUrls,
  type WechatBodyImageReplacement,
  type WechatBodyImageUploadResultItem,
  type WechatBodyImageUploadPlan
} from "./wechat-body-images";
import { prepareWechatUploadAsset, prepareWechatUploadFile } from "./wechat-upload-assets";

export type RealWechatDraftClientOptions = {
  appId: string;
  appSecret: string;
  author?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
};

export type RealWechatDraftUploadInput = {
  article: ArticleProject;
  draft: DraftVersion;
  htmlAsset: ArticleAsset;
  bodyHtml: string;
  bodyImagePlan: WechatBodyImageUploadPlan;
  coverAssets: ArticleAsset[];
};

export type RealWechatDraftUploadResult = {
  mediaId: string;
  articleUrl?: string;
  bodyImageUploads?: WechatBodyImageUploadResultItem[];
};

type WechatJson = Record<string, unknown> & {
  errcode?: number;
  errmsg?: string;
};

const DEFAULT_API_BASE = "https://api.weixin.qq.com/cgi-bin";

function appendQuery(url: string, query: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function apiUrl(apiBase: string, pathname: string, query: Record<string, string> = {}): string {
  const base = apiBase.replace(/\/+$/, "");
  return appendQuery(`${base}${pathname}`, query);
}

function extractBodyContent(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1]?.trim() || html;
}

function shortDigest(article: ArticleProject): string {
  const source = article.coreProblem || article.topic || article.title;
  return source.slice(0, 120);
}

function requiredString(payload: WechatJson, key: string, context: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`微信接口返回缺少 ${context}：${key}`);
  }
  return value;
}

function ensureWechatSuccess(payload: WechatJson): void {
  if (payload.errcode !== undefined && payload.errcode !== 0) {
    const message = payload.errmsg || "未知错误";
    throw new Error(`微信接口失败：${message} (${payload.errcode})`);
  }
}

function fileBlob(filePath: string, mimeType: string | null | undefined): Blob {
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

export class RealWechatDraftClient {
  readonly supportsBodyImageUpload = true;

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly author: string;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RealWechatDraftClientOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.author = options.author || "";
    this.apiBase = options.apiBase || DEFAULT_API_BASE;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async uploadDraft(input: RealWechatDraftUploadInput): Promise<RealWechatDraftUploadResult> {
    this.assertBodyImagePlanReady(input.bodyImagePlan);
    const accessToken = await this.getAccessToken();
    const thumbMediaId = await this.uploadThumb(accessToken, this.requireCover(input.coverAssets));
    const replacements: WechatBodyImageReplacement[] = [];
    const bodyImageUploads: WechatBodyImageUploadResultItem[] = [];
    for (const image of input.bodyImagePlan.images) {
      const wechatUrl = await this.uploadBodyImage(accessToken, {
        filePath: image.assetPath,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height
      });
      replacements.push({
        originalSrc: image.originalSrc,
        wechatUrl
      });
      bodyImageUploads.push({
        assetId: image.assetId,
        sourcePlanId: image.sourcePlanId,
        sourcePlanItemId: image.sourcePlanItemId,
        originalSrc: image.originalSrc,
        wechatUrl,
        status: "success",
        occurrenceCount: image.occurrenceCount,
        altTexts: image.altTexts
      });
    }

    const replaced = replaceWechatBodyImageUrls(extractBodyContent(input.bodyHtml), replacements);
    if (replaced.summary.unusedReplacementCount > 0) {
      throw new Error(`正文图片 URL 替换失败：${replaced.unusedReplacementSrcs.join(", ")}`);
    }

    const draft = await this.createDraft(accessToken, {
      article: input.article,
      content: replaced.html,
      thumbMediaId
    });

    return {
      mediaId: requiredString(draft, "media_id", "草稿 media_id"),
      bodyImageUploads
    };
  }

  private assertBodyImagePlanReady(plan: WechatBodyImageUploadPlan): void {
    if (plan.issues.length === 0) {
      return;
    }
    throw new Error(`正文图片上传准备失败：${plan.issues.map((issue) => issue.message).join("；")}`);
  }

  private requireCover(coverAssets: ArticleAsset[]): ArticleAsset {
    const cover = coverAssets.find((asset) => asset.assetType === "cover" && asset.variant === "wechat_21_9") || coverAssets[0];
    if (!cover) {
      throw new Error("缺少公众号封面素材");
    }
    if (!fs.existsSync(cover.path)) {
      throw new Error(`公众号封面文件不存在：${cover.path}`);
    }
    return cover;
  }

  private async getAccessToken(): Promise<string> {
    const payload = await this.requestJson(
      apiUrl(this.apiBase, "/token", {
        grant_type: "client_credential",
        appid: this.appId,
        secret: this.appSecret
      })
    );
    return requiredString(payload, "access_token", "access_token");
  }

  private async uploadThumb(accessToken: string, cover: ArticleAsset): Promise<string> {
    const prepared = await prepareWechatUploadAsset(cover);
    const payload = await this.uploadMultipart(
      apiUrl(this.apiBase, "/material/add_material", {
        access_token: accessToken,
        type: "thumb"
      }),
      prepared.filePath,
      prepared.mimeType
    );
    return requiredString(payload, "media_id", "thumb media_id");
  }

  private async uploadBodyImage(
    accessToken: string,
    input: { filePath: string; mimeType: string | null; width: number | null; height: number | null }
  ): Promise<string> {
    const prepared = await prepareWechatUploadFile(input);
    const payload = await this.uploadMultipart(
      apiUrl(this.apiBase, "/media/uploadimg", {
        access_token: accessToken
      }),
      prepared.filePath,
      prepared.mimeType
    );
    return requiredString(payload, "url", "正文图片 URL");
  }

  private async createDraft(
    accessToken: string,
    input: { article: ArticleProject; content: string; thumbMediaId: string }
  ): Promise<WechatJson> {
    return this.requestJson(
      apiUrl(this.apiBase, "/draft/add", {
        access_token: accessToken
      }),
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          articles: [
            {
              title: input.article.title,
              author: this.author,
              digest: shortDigest(input.article),
              content: input.content,
              thumb_media_id: input.thumbMediaId,
              need_open_comment: 0,
              only_fans_can_comment: 0
            }
          ]
        })
      }
    );
  }

  private async uploadMultipart(url: string, filePath: string, mimeType: string | null | undefined): Promise<WechatJson> {
    const formData = new FormData();
    formData.append("media", fileBlob(filePath, mimeType), path.basename(filePath));
    return this.requestJson(url, {
      method: "POST",
      body: formData
    });
  }

  private async requestJson(url: string, init?: RequestInit): Promise<WechatJson> {
    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`微信接口 HTTP ${response.status}：${text.slice(0, 200)}`);
    }
    let payload: WechatJson;
    try {
      payload = JSON.parse(text) as WechatJson;
    } catch {
      throw new Error(`微信接口返回不是 JSON：${text.slice(0, 200)}`);
    }
    ensureWechatSuccess(payload);
    return payload;
  }
}
