import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { assertWechatConfig, readAppConfig, type AppConfig } from "@/config/env";
import { type ArticleStatus, assertCanTransition } from "@/domain/status";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  articleAssets,
  articleProjects,
  draftVersions,
  illustrationPlans,
  wechatDraftUploadImages,
  wechatDraftUploads,
  workflowEvents,
  type ArticleAsset,
  type ArticleProject,
  type DraftVersion,
  type WechatDraftUploadImage,
  type WechatDraftUpload
} from "@/db/schema";

import { parseIllustrationPlanPayload, type IllustrationPlanItem } from "./illustration-plans";
import {
  buildWechatBodyImageUploadPlan,
  type WechatBodyImageUploadResultItem,
  type WechatBodyImageUploadPlan
} from "./wechat-body-images";
import { RealWechatDraftClient } from "./wechat-draft-client";

export type AssetRootOptions = {
  assetRoot?: string;
};

export type CoverSourceInput = {
  filename?: string;
  mimeType?: string;
  buffer?: Buffer;
};

export type WechatDraftUploadResult = {
  mediaId: string;
  articleUrl?: string;
  bodyImageUploads?: WechatBodyImageUploadResultItem[];
};

export type WechatDraftClient = {
  supportsBodyImageUpload?: boolean;
  uploadDraft(input: {
    article: ArticleProject;
    draft: DraftVersion;
    htmlAsset: ArticleAsset;
    bodyHtml: string;
    bodyImagePlan: WechatBodyImageUploadPlan;
    coverAssets: ArticleAsset[];
  }): Promise<WechatDraftUploadResult>;
};

export class FakeWechatDraftClient implements WechatDraftClient {
  async uploadDraft(input: { article: ArticleProject }): Promise<WechatDraftUploadResult> {
    return {
      mediaId: `fake_media_${input.article.id.slice(0, 8)}`,
      articleUrl: `fake://wechat-draft/${input.article.id}`
    };
  }
}

export function createWechatDraftClient(config: AppConfig = readAppConfig()): WechatDraftClient {
  if (process.env.NODE_ENV === "test" || process.env.WORKBENCH_USE_FAKE_WECHAT === "1") {
    return new FakeWechatDraftClient();
  }
  assertWechatConfig(config);
  return new RealWechatDraftClient({
    appId: config.wechatAppId,
    appSecret: config.wechatAppSecret,
    author: config.wechatAuthor,
    apiBase: config.wechatApiBase
  });
}

type InlineIllustrationHtmlInput = {
  articleId: string;
  item: IllustrationPlanItem;
  asset: ArticleAsset;
};

type InlineIllustrationCollection = {
  illustrations: InlineIllustrationHtmlInput[];
  warnings: string[];
};

type WechatHtmlRenderResult = {
  html: string;
  warnings: string[];
  insertedAssetIds: string[];
};

const LOCAL_INLINE_ILLUSTRATION_WARNING =
  "正文配图使用本地资产引用，无法直接进入公众号草稿箱。请先上传为微信正文图片 URL，或在公众号后台人工处理后再发布。";

function hasBlockingHtmlWarnings(
  errorMessage: string | null,
  client: WechatDraftClient,
  bodyImagePlan: WechatBodyImageUploadPlan
): boolean {
  if (!errorMessage) {
    return false;
  }
  const warnings = errorMessage
    .split(/\r?\n/)
    .map((warning) => warning.trim())
    .filter(Boolean);
  if (
    client.supportsBodyImageUpload &&
    bodyImagePlan.images.length > 0 &&
    bodyImagePlan.issues.length === 0 &&
    warnings.every((warning) => warning === LOCAL_INLINE_ILLUSTRATION_WARNING)
  ) {
    return false;
  }
  return warnings.length > 0;
}

function defaultAssetRoot(): string {
  return path.join(process.cwd(), "data", "assets");
}

function requireArticle(id: string, db: WorkbenchDatabase): ArticleProject {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, id)).get();
  if (!article) {
    throw new Error("文章不存在");
  }
  return article;
}

function requireFinalDraft(article: ArticleProject, db: WorkbenchDatabase): DraftVersion {
  if (!article.finalDraftVersionId) {
    throw new Error("请先标记最终稿");
  }
  const draft = db
    .select()
    .from(draftVersions)
    .where(and(eq(draftVersions.id, article.finalDraftVersionId), eq(draftVersions.articleId, article.id)))
    .get();
  if (!draft || !draft.isFinal) {
    throw new Error("最终稿不存在或状态不一致");
  }
  return draft;
}

function recordWorkflowEvent(
  db: WorkbenchDatabase,
  article: ArticleProject,
  fromStatus: ArticleStatus | null,
  toStatus: ArticleStatus,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  db.insert(workflowEvents)
    .values({
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      eventType,
      fromStatus,
      toStatus,
      payloadJson: JSON.stringify(payload)
    })
    .run();
}

function transitionArticle(
  db: WorkbenchDatabase,
  article: ArticleProject,
  toStatus: ArticleStatus,
  eventType: string,
  payload: Record<string, unknown> = {}
): ArticleProject {
  const fromStatus = article.status as ArticleStatus;
  if (fromStatus === toStatus) {
    recordWorkflowEvent(db, article, fromStatus, toStatus, eventType, payload);
    return article;
  }
  assertCanTransition(fromStatus, toStatus);
  const updatedAt = new Date().toISOString();
  db.update(articleProjects).set({ status: toStatus, updatedAt }).where(eq(articleProjects.id, article.id)).run();
  recordWorkflowEvent(db, article, fromStatus, toStatus, eventType, payload);
  return { ...article, status: toStatus, updatedAt };
}

function articleAssetDir(articleId: string, assetRoot = defaultAssetRoot()): string {
  return path.join(assetRoot, "articles", articleId);
}

function writeAssetFile(filePath: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAnchor(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractPositionAnchor(position: string): string {
  const quoted = position.match(/[“"]([^”"]+)[”"]/) || position.match(/《([^》]+)》/);
  return normalizeAnchor(quoted?.[1] || position);
}

function getPositionPlacement(position: string): "before" | "after" {
  return /前|之前/.test(position) ? "before" : "after";
}

function getMarkdownLineAnchor(line: string): string | null {
  if (line.startsWith("# ")) {
    return normalizeAnchor(line.slice(2));
  }
  if (line.startsWith("## ")) {
    return normalizeAnchor(line.slice(3));
  }
  if (line.startsWith("- ")) {
    return normalizeAnchor(line.slice(2));
  }
  return normalizeAnchor(line) || null;
}

function renderInlineIllustrationFigure(input: InlineIllustrationHtmlInput): string {
  const src = `/api/articles/${input.articleId}/assets/${input.asset.id}/file`;
  const alt = input.item.purpose || input.item.imageType || "正文配图";
  const caption = input.item.purpose || input.item.imageType;

  return [
    `<figure class="wechat-inline-illustration" data-plan-item-id="${escapeHtml(input.item.itemId)}" data-asset-id="${escapeHtml(input.asset.id)}" style="margin:24px 0;text-align:center;">`,
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:8px;" />`,
    caption ? `<figcaption style="font-size:13px;color:#777;margin-top:8px;">${escapeHtml(caption)}</figcaption>` : "",
    "</figure>"
  ]
    .filter(Boolean)
    .join("\n");
}

function renderWechatHtml(markdown: string, inlineIllustrations: InlineIllustrationHtmlInput[] = []): WechatHtmlRenderResult {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [
    '<article class="wechat-article" style="font-size:16px;line-height:1.8;color:#222;">'
  ];
  let inList = false;
  const beforeAnchors = new Map<string, InlineIllustrationHtmlInput[]>();
  const afterAnchors = new Map<string, InlineIllustrationHtmlInput[]>();
  const unmatchedItemIds = new Set(inlineIllustrations.map((input) => input.item.itemId));
  const insertedAssetIds: string[] = [];

  for (const illustration of inlineIllustrations) {
    const anchor = extractPositionAnchor(illustration.item.position);
    if (!anchor) {
      continue;
    }
    const target = getPositionPlacement(illustration.item.position) === "before" ? beforeAnchors : afterAnchors;
    const current = target.get(anchor) || [];
    current.push(illustration);
    target.set(anchor, current);
  }

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function insertIllustrations(items: InlineIllustrationHtmlInput[] | undefined) {
    if (!items || items.length === 0) {
      return;
    }
    closeList();
    for (const item of items) {
      html.push(renderInlineIllustrationFigure(item));
      unmatchedItemIds.delete(item.item.itemId);
      insertedAssetIds.push(item.asset.id);
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const anchor = getMarkdownLineAnchor(line);
    if (anchor) {
      insertIllustrations(beforeAnchors.get(anchor));
    }
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1 style="font-size:24px;line-height:1.35;margin:0 0 18px;">${escapeHtml(line.slice(2))}</h1>`);
      if (anchor) {
        insertIllustrations(afterAnchors.get(anchor));
      }
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2 style="font-size:18px;line-height:1.45;margin:28px 0 12px;">${escapeHtml(line.slice(3))}</h2>`);
      if (anchor) {
        insertIllustrations(afterAnchors.get(anchor));
      }
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push('<ul style="padding-left:1.25em;margin:10px 0 16px;">');
        inList = true;
      }
      html.push(`<li style="margin:6px 0;">${escapeHtml(line.slice(2))}</li>`);
      if (anchor) {
        insertIllustrations(afterAnchors.get(anchor));
      }
      continue;
    }
    closeList();
    html.push(`<p style="margin:0 0 14px;">${escapeHtml(line)}</p>`);
    if (anchor) {
      insertIllustrations(afterAnchors.get(anchor));
    }
  }
  closeList();
  html.push("</article>");
  const warnings = inlineIllustrations
    .filter((input) => unmatchedItemIds.has(input.item.itemId))
    .map((input) => `未匹配插入位置：${input.item.position}`);
  return {
    html: html.join("\n"),
    warnings,
    insertedAssetIds
  };
}

export function markdownToWechatHtml(markdown: string): string {
  return renderWechatHtml(markdown).html;
}

export function listArticleAssets(articleId: string, db: WorkbenchDatabase = getDatabase().db): ArticleAsset[] {
  return db
    .select()
    .from(articleAssets)
    .where(eq(articleAssets.articleId, articleId))
    .orderBy(desc(articleAssets.createdAt))
    .all();
}

export function listWechatDraftUploads(articleId: string, db: WorkbenchDatabase = getDatabase().db): WechatDraftUpload[] {
  return db
    .select()
    .from(wechatDraftUploads)
    .where(eq(wechatDraftUploads.articleId, articleId))
    .orderBy(desc(wechatDraftUploads.uploadedAt))
    .all();
}

export function listWechatDraftUploadImages(
  articleId: string,
  db: WorkbenchDatabase = getDatabase().db
): WechatDraftUploadImage[] {
  return db
    .select()
    .from(wechatDraftUploadImages)
    .where(eq(wechatDraftUploadImages.articleId, articleId))
    .orderBy(desc(wechatDraftUploadImages.uploadedAt))
    .all();
}

function collectConfirmedInlineIllustrations(
  article: ArticleProject,
  draft: DraftVersion,
  db: WorkbenchDatabase
): InlineIllustrationCollection {
  const plan = db
    .select()
    .from(illustrationPlans)
    .where(
      and(
        eq(illustrationPlans.articleId, article.id),
        eq(illustrationPlans.finalDraftVersionId, draft.id),
        eq(illustrationPlans.status, "confirmed")
      )
    )
    .orderBy(desc(illustrationPlans.createdAt))
    .get();
  if (!plan) {
    return { illustrations: [], warnings: [] };
  }

  const assets = listArticleAssets(article.id, db);
  const warnings: string[] = [];
  const illustrations = parseIllustrationPlanPayload(plan.planJson).items.flatMap((item) => {
    const asset = assets.find(
      (candidate) =>
        candidate.assetType === "inline_illustration" &&
        candidate.status === "ready" &&
        candidate.draftVersionId === draft.id &&
        candidate.sourcePlanId === plan.id &&
        candidate.sourcePlanItemId === item.itemId
    );
    if (!asset) {
      return [];
    }
    if (!fs.existsSync(asset.path)) {
      warnings.push(`正文配图文件不存在，未插入：${item.position}`);
      return [];
    }
    return [{ articleId: article.id, item, asset }];
  });

  return { illustrations, warnings };
}

export function renderWechatHtmlAsset(
  articleId: string,
  db: WorkbenchDatabase = getDatabase().db,
  options: AssetRootOptions = {}
): ArticleAsset {
  const article = requireArticle(articleId, db);
  const draft = requireFinalDraft(article, db);
  if (!["ready_to_publish", "publish_package_generated", "cover_generated", "uploaded_to_draft_box"].includes(article.status)) {
    throw new Error("请先标记待发布");
  }
  const inlineIllustrations = collectConfirmedInlineIllustrations(article, draft, db);
  const rendered = renderWechatHtml(draft.markdown, inlineIllustrations.illustrations);
  const warnings = [...inlineIllustrations.warnings, ...rendered.warnings];
  if (rendered.insertedAssetIds.length > 0) {
    warnings.unshift(LOCAL_INLINE_ILLUSTRATION_WARNING);
  }
  const html = rendered.html;
  const relativePath = path.join("articles", article.id, "html", `draft-v${draft.versionNo}.html`);
  const filePath = path.join(options.assetRoot || defaultAssetRoot(), relativePath);
  const now = new Date().toISOString();
  const asset: ArticleAsset = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    draftVersionId: draft.id,
    sourcePlanId: null,
    sourcePlanItemId: null,
    assetType: "html",
    status: "ready",
    variant: "wechat_inline",
    path: filePath,
    mimeType: "text/html",
    source: "markdown_final_draft",
    promptSnapshot: null,
    provider: null,
    errorMessage: warnings.length > 0 ? warnings.join("\n") : null,
    width: null,
    height: null,
    generatedAt: now,
    createdAt: now
  };

  db.transaction(() => {
    writeAssetFile(filePath, html);
    db.insert(articleAssets).values(asset).run();
    if (article.status === "ready_to_publish") {
      transitionArticle(db, article, "publish_package_generated", "render_html", {
        draftVersionId: draft.id,
        assetId: asset.id,
        inlineIllustrationAssetIds: rendered.insertedAssetIds,
        warnings
      });
    } else {
      recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "render_html", {
        draftVersionId: draft.id,
        assetId: asset.id,
        inlineIllustrationAssetIds: rendered.insertedAssetIds,
        warnings
      });
    }
  });

  return asset;
}

function buildCoverSvg(input: {
  title: string;
  subtitle: string;
  width: number;
  height: number;
  sourceName?: string;
}): string {
  const title = escapeHtml(input.title);
  const subtitle = escapeHtml(input.subtitle);
  const source = input.sourceName ? `素材：${escapeHtml(input.sourceName)}` : "默认无照片封面";
  const titleSize = input.height > input.width ? 54 : 44;
  const subtitleSize = input.height > input.width ? 24 : 22;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `<rect width="${input.width}" height="${input.height}" fill="#f7f6f2"/>`,
    `<rect x="28" y="28" width="${input.width - 56}" height="${input.height - 56}" rx="18" fill="#ffffff" stroke="#d3cec3"/>`,
    `<rect x="56" y="56" width="96" height="8" rx="4" fill="#235f6d"/>`,
    `<text x="56" y="${Math.round(input.height * 0.42)}" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#22201c">${title}</text>`,
    `<text x="56" y="${Math.round(input.height * 0.42) + 48}" font-family="Arial, sans-serif" font-size="${subtitleSize}" fill="#6f6a60">${subtitle}</text>`,
    `<text x="56" y="${input.height - 58}" font-family="Arial, sans-serif" font-size="18" fill="#928b7d">${source}</text>`,
    "</svg>"
  ].join("\n");
}

export function generateCoverAssets(
  articleId: string,
  source: CoverSourceInput = {},
  db: WorkbenchDatabase = getDatabase().db,
  options: AssetRootOptions = {}
): ArticleAsset[] {
  const article = requireArticle(articleId, db);
  const draft = requireFinalDraft(article, db);
  if (!["publish_package_generated", "cover_generated"].includes(article.status)) {
    throw new Error("请先生成公众号 HTML");
  }
  const root = options.assetRoot || defaultAssetRoot();
  const sourceLabel = source.filename ? `upload:${source.filename}` : "default_no_photo";
  const now = new Date().toISOString();
  const variants = [
    { variant: "wechat_21_9", width: 900, height: 386 },
    { variant: "wechat_1_1", width: 900, height: 900 }
  ];
  const assets = variants.map((variant) => {
    const relativePath = path.join("articles", article.id, "covers", `${variant.variant}.svg`);
    return {
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      draftVersionId: draft.id,
      sourcePlanId: null,
      sourcePlanItemId: null,
      assetType: "cover",
      status: "ready",
      variant: variant.variant,
      path: path.join(root, relativePath),
      mimeType: "image/svg+xml",
      source: sourceLabel,
      promptSnapshot: null,
      provider: "local_cover_svg",
      errorMessage: null,
      width: variant.width,
      height: variant.height,
      generatedAt: now,
      createdAt: now
    } satisfies ArticleAsset;
  });

  db.transaction(() => {
    if (source.buffer && source.filename) {
      const uploadPath = path.join(articleAssetDir(article.id, root), "cover-source", source.filename);
      writeAssetFile(uploadPath, source.buffer);
      db.insert(articleAssets)
        .values({
          id: randomUUID(),
          articleId: article.id,
          ownerId: article.ownerId,
          draftVersionId: draft.id,
          sourcePlanId: null,
          sourcePlanItemId: null,
          assetType: "cover_source",
          status: "ready",
          variant: "upload",
          path: uploadPath,
          mimeType: source.mimeType || null,
          source: "upload",
          promptSnapshot: null,
          provider: null,
          errorMessage: null,
          width: null,
          height: null,
          generatedAt: now,
          createdAt: now
        })
        .run();
    }
    for (const asset of assets) {
      const svg = buildCoverSvg({
        title: article.title,
        subtitle: "公众号发布封面",
        width: asset.width || 900,
        height: asset.height || 900,
        sourceName: source.filename
      });
      writeAssetFile(asset.path, svg);
    }
    db.insert(articleAssets).values(assets).run();
    if (article.status === "publish_package_generated") {
      transitionArticle(db, article, "cover_generated", "generate_cover", {
        draftVersionId: draft.id,
        assetIds: assets.map((asset) => asset.id)
      });
    } else {
      recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "generate_cover", {
        draftVersionId: draft.id,
        assetIds: assets.map((asset) => asset.id)
      });
    }
  });

  return assets;
}

function latestAsset(
  articleId: string,
  predicate: (asset: ArticleAsset) => boolean,
  db: WorkbenchDatabase
): ArticleAsset | null {
  return listArticleAssets(articleId, db).find(predicate) || null;
}

export async function uploadWechatDraft(
  articleId: string,
  client: WechatDraftClient = createWechatDraftClient(),
  db: WorkbenchDatabase = getDatabase().db
): Promise<WechatDraftUpload> {
  const article = requireArticle(articleId, db);
  const draft = requireFinalDraft(article, db);
  if (article.status !== "cover_generated" && article.status !== "uploaded_to_draft_box") {
    throw new Error("请先生成 HTML 和封面");
  }
  const htmlAsset = latestAsset(
    article.id,
    (asset) => asset.assetType === "html" && asset.draftVersionId === draft.id,
    db
  );
  const cover21 = latestAsset(article.id, (asset) => asset.assetType === "cover" && asset.variant === "wechat_21_9", db);
  const cover11 = latestAsset(article.id, (asset) => asset.assetType === "cover" && asset.variant === "wechat_1_1", db);
  if (!htmlAsset || !cover21 || !cover11) {
    throw new Error("上传前必须具备 HTML 和 21:9、1:1 封面");
  }
  const bodyHtml = fs.readFileSync(htmlAsset.path, "utf8");
  const bodyImagePlan = buildWechatBodyImageUploadPlan({
    articleId: article.id,
    html: bodyHtml,
    assets: listArticleAssets(article.id, db)
  });
  if (hasBlockingHtmlWarnings(htmlAsset.errorMessage, client, bodyImagePlan)) {
    throw new Error(`发布包存在正文配图处理提示：${htmlAsset.errorMessage}`);
  }

  const baseUpload = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    draftVersionId: draft.id,
    coverAssetId: cover21.id,
    htmlAssetId: htmlAsset.id,
    wechatMediaId: null,
    wechatArticleUrl: null,
    status: "failed",
    errorMessage: null,
    uploadedAt: null
  } satisfies WechatDraftUpload;

  try {
    const result = await client.uploadDraft({
      article,
      draft,
      htmlAsset,
      bodyHtml,
      bodyImagePlan,
      coverAssets: [cover21, cover11]
    });
    const upload: WechatDraftUpload = {
      ...baseUpload,
      wechatMediaId: result.mediaId,
      wechatArticleUrl: result.articleUrl || null,
      status: "success",
      uploadedAt: new Date().toISOString()
    };
    db.transaction(() => {
      db.insert(wechatDraftUploads).values(upload).run();
      const imageUploads = (result.bodyImageUploads || []).map((image) => ({
        id: randomUUID(),
        uploadId: upload.id,
        articleId: article.id,
        ownerId: article.ownerId,
        draftVersionId: draft.id,
        htmlAssetId: htmlAsset.id,
        assetId: image.assetId,
        sourcePlanId: image.sourcePlanId,
        sourcePlanItemId: image.sourcePlanItemId,
        originalSrc: image.originalSrc,
        wechatUrl: image.wechatUrl,
        status: image.status,
        errorMessage: image.errorMessage || null,
        occurrenceCount: image.occurrenceCount,
        altTextsJson: JSON.stringify(image.altTexts),
        uploadedAt: upload.uploadedAt
      }));
      if (imageUploads.length > 0) {
        db.insert(wechatDraftUploadImages).values(imageUploads).run();
      }
      if (article.status === "cover_generated") {
        transitionArticle(db, article, "uploaded_to_draft_box", "upload_wechat_draft", {
          uploadId: upload.id,
          mediaId: result.mediaId
        });
      } else {
        recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "upload_wechat_draft", {
          uploadId: upload.id,
          mediaId: result.mediaId
        });
      }
    });
    return upload;
  } catch (error) {
    const upload: WechatDraftUpload = {
      ...baseUpload,
      errorMessage: error instanceof Error ? error.message : "上传草稿箱失败",
      uploadedAt: new Date().toISOString()
    };
    db.insert(wechatDraftUploads).values(upload).run();
    return upload;
  }
}
