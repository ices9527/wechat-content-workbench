import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { type ArticleStatus, assertCanTransition } from "@/domain/status";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  articleAssets,
  articleProjects,
  draftVersions,
  wechatDraftUploads,
  workflowEvents,
  type ArticleAsset,
  type ArticleProject,
  type DraftVersion,
  type WechatDraftUpload
} from "@/db/schema";

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
};

export type WechatDraftClient = {
  uploadDraft(input: {
    article: ArticleProject;
    draft: DraftVersion;
    htmlAsset: ArticleAsset;
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

export function markdownToWechatHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [
    '<article class="wechat-article" style="font-size:16px;line-height:1.8;color:#222;">'
  ];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1 style="font-size:24px;line-height:1.35;margin:0 0 18px;">${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2 style="font-size:18px;line-height:1.45;margin:28px 0 12px;">${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push('<ul style="padding-left:1.25em;margin:10px 0 16px;">');
        inList = true;
      }
      html.push(`<li style="margin:6px 0;">${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    html.push(`<p style="margin:0 0 14px;">${escapeHtml(line)}</p>`);
  }
  closeList();
  html.push("</article>");
  return html.join("\n");
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
  const html = markdownToWechatHtml(draft.markdown);
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
    errorMessage: null,
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
        assetId: asset.id
      });
    } else {
      recordWorkflowEvent(db, article, article.status as ArticleStatus, article.status as ArticleStatus, "render_html", {
        draftVersionId: draft.id,
        assetId: asset.id
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
  client: WechatDraftClient = new FakeWechatDraftClient(),
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
    const result = await client.uploadDraft({ article, draft, htmlAsset, coverAssets: [cover21, cover11] });
    const upload: WechatDraftUpload = {
      ...baseUpload,
      wechatMediaId: result.mediaId,
      wechatArticleUrl: result.articleUrl || null,
      status: "success",
      uploadedAt: new Date().toISOString()
    };
    db.transaction(() => {
      db.insert(wechatDraftUploads).values(upload).run();
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
