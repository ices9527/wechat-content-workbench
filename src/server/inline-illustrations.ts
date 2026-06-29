import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { ArticleStatus } from "@/domain/status";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { articleAssets, workflowEvents, type ArticleAsset, type ArticleProject, type DraftVersion } from "@/db/schema";

import { requireArticle, requireDraft } from "./article-records";
import { parseIllustrationPlanPayload, requireIllustrationPlan, type IllustrationPlanItem } from "./illustration-plans";

export const generateInlineIllustrationInputSchema = z.object({
  planId: z.string().trim().min(1, "必须指定配图规划"),
  planItemId: z.string().trim().min(1, "必须指定配图项")
});

export type GenerateInlineIllustrationInput = z.input<typeof generateInlineIllustrationInputSchema>;

export type InlineIllustrationClientInput = {
  article: ArticleProject;
  draft: DraftVersion;
  item: IllustrationPlanItem;
  prompt: string;
  width: number;
  height: number;
};

export type InlineIllustrationClientResult = {
  content: string | Buffer;
  mimeType: string;
  provider: string;
  width: number;
  height: number;
  prompt: string;
};

export type InlineIllustrationClient = {
  provider: string;
  generate(input: InlineIllustrationClientInput): Promise<InlineIllustrationClientResult>;
};

export type InlineIllustrationAssetFile = {
  asset: ArticleAsset;
  content: Buffer;
  contentType: string;
};

function defaultAssetRoot(): string {
  return path.join(process.cwd(), "data", "assets");
}

function writeAssetFile(filePath: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function buildInlineIllustrationPrompt(item: IllustrationPlanItem): string {
  return [
    `图片类型：${item.imageType}`,
    `插入位置：${item.position}`,
    `图片作用：${item.purpose}`,
    `画面说明：${item.visualBrief}`,
    `Prompt 简报：${item.promptBrief}`,
    item.doNotVisualize ? `不要画：${item.doNotVisualize}` : "",
    item.riskNotes ? `风险提醒：${item.riskNotes}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFakeInlineSvg(input: InlineIllustrationClientInput): string {
  const title = escapeXml(compactText(input.article.title, 32));
  const imageType = escapeXml(compactText(input.item.imageType, 24));
  const position = escapeXml(compactText(input.item.position, 42));
  const purpose = escapeXml(compactText(input.item.purpose, 46));
  const visualBrief = escapeXml(compactText(input.item.visualBrief, 58));
  const riskNotes = escapeXml(compactText(input.item.riskNotes || "保留合规边界，不画确定承诺。", 54));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `<rect width="${input.width}" height="${input.height}" fill="#f7f6f2"/>`,
    '<rect x="48" y="48" width="1104" height="579" rx="22" fill="#ffffff" stroke="#d6d1c5" stroke-width="2"/>',
    '<rect x="86" y="86" width="132" height="10" rx="5" fill="#235f6d"/>',
    `<text x="86" y="150" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#22201c">${title}</text>`,
    `<text x="86" y="205" font-family="Arial, sans-serif" font-size="23" font-weight="700" fill="#235f6d">${imageType}</text>`,
    '<line x1="86" y1="236" x2="1114" y2="236" stroke="#e7e2d8" stroke-width="2"/>',
    `<text x="86" y="305" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#22201c">插入位置</text>`,
    `<text x="250" y="305" font-family="Arial, sans-serif" font-size="25" fill="#6f6a60">${position}</text>`,
    `<text x="86" y="375" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#22201c">图片作用</text>`,
    `<text x="250" y="375" font-family="Arial, sans-serif" font-size="25" fill="#6f6a60">${purpose}</text>`,
    `<text x="86" y="445" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#22201c">画面说明</text>`,
    `<text x="250" y="445" font-family="Arial, sans-serif" font-size="25" fill="#6f6a60">${visualBrief}</text>`,
    `<text x="86" y="515" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#22201c">边界提醒</text>`,
    `<text x="250" y="515" font-family="Arial, sans-serif" font-size="25" fill="#6f6a60">${riskNotes}</text>`,
    '<text x="86" y="590" font-family="Arial, sans-serif" font-size="18" fill="#928b7d">Fake SVG · Sprint 13B-A placeholder</text>',
    "</svg>"
  ].join("\n");
}

export class FakeInlineIllustrationClient implements InlineIllustrationClient {
  provider = "fake_svg_illustration";

  async generate(input: InlineIllustrationClientInput): Promise<InlineIllustrationClientResult> {
    const prompt = input.prompt || buildInlineIllustrationPrompt(input.item);
    return {
      content: buildFakeInlineSvg({ ...input, prompt }),
      mimeType: "image/svg+xml",
      provider: this.provider,
      width: input.width,
      height: input.height,
      prompt
    };
  }
}

function recordWorkflowEvent(
  db: WorkbenchDatabase,
  article: ArticleProject,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  const status = article.status as ArticleStatus;
  db.insert(workflowEvents)
    .values({
      id: randomUUID(),
      articleId: article.id,
      ownerId: article.ownerId,
      eventType,
      fromStatus: status,
      toStatus: status,
      payloadJson: JSON.stringify(payload)
    })
    .run();
}

function createPendingInlineAsset(input: {
  article: ArticleProject;
  draft: DraftVersion;
  planId: string;
  item: IllustrationPlanItem;
  assetRoot: string;
  provider: string;
  prompt: string;
  width: number;
  height: number;
}): ArticleAsset {
  const id = randomUUID();
  const now = new Date().toISOString();
  const itemSlug = safePathPart(input.item.itemId);
  const relativePath = path.join("articles", input.article.id, "inline-illustrations", `${itemSlug}-${id}.svg`);
  return {
    id,
    articleId: input.article.id,
    ownerId: input.article.ownerId,
    draftVersionId: input.draft.id,
    sourcePlanId: input.planId,
    sourcePlanItemId: input.item.itemId,
    assetType: "inline_illustration",
    status: "generating",
    variant: itemSlug,
    path: path.join(input.assetRoot, relativePath),
    mimeType: "image/svg+xml",
    source: "illustration_plan",
    promptSnapshot: input.prompt,
    provider: input.provider,
    errorMessage: null,
    width: input.width,
    height: input.height,
    generatedAt: null,
    createdAt: now
  };
}

export async function generateInlineIllustration(
  articleId: string,
  input: GenerateInlineIllustrationInput,
  client: InlineIllustrationClient = new FakeInlineIllustrationClient(),
  db: WorkbenchDatabase = getDatabase().db,
  options: { assetRoot?: string } = {}
): Promise<ArticleAsset> {
  const parsed = generateInlineIllustrationInputSchema.parse(input);
  const article = requireArticle(articleId, db);
  const plan = requireIllustrationPlan(article.id, parsed.planId, db);
  if (plan.status !== "confirmed") {
    throw new Error("请先确认配图规划");
  }

  const item = parseIllustrationPlanPayload(plan.planJson).items.find((current) => current.itemId === parsed.planItemId);
  if (!item) {
    throw new Error("配图规划项不存在");
  }

  const draft = requireDraft(article.id, plan.finalDraftVersionId, db);
  const width = 1200;
  const height = 675;
  const prompt = buildInlineIllustrationPrompt(item);
  const pendingAsset = createPendingInlineAsset({
    article,
    draft,
    planId: plan.id,
    item,
    assetRoot: options.assetRoot || defaultAssetRoot(),
    provider: client.provider,
    prompt,
    width,
    height
  });

  db.insert(articleAssets).values(pendingAsset).run();

  try {
    const result = await client.generate({ article, draft, item, prompt, width, height });
    const now = new Date().toISOString();
    writeAssetFile(pendingAsset.path, result.content);
    const updates = {
      status: "ready",
      mimeType: result.mimeType,
      provider: result.provider,
      promptSnapshot: result.prompt,
      width: result.width,
      height: result.height,
      errorMessage: null,
      generatedAt: now
    };
    db.transaction(() => {
      db.update(articleAssets).set(updates).where(eq(articleAssets.id, pendingAsset.id)).run();
      recordWorkflowEvent(db, article, "generate_inline_illustration", {
        assetId: pendingAsset.id,
        planId: plan.id,
        planItemId: item.itemId,
        provider: result.provider
      });
    });
    return { ...pendingAsset, ...updates };
  } catch (error) {
    const now = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : "正文配图生成失败";
    db.transaction(() => {
      db.update(articleAssets)
        .set({ status: "failed", errorMessage, generatedAt: now })
        .where(eq(articleAssets.id, pendingAsset.id))
        .run();
      recordWorkflowEvent(db, article, "generate_inline_illustration_failed", {
        assetId: pendingAsset.id,
        planId: plan.id,
        planItemId: item.itemId,
        errorMessage
      });
    });
    throw error;
  }
}

export function requireInlineIllustrationAssetFile(
  articleId: string,
  assetId: string,
  db: WorkbenchDatabase = getDatabase().db
): InlineIllustrationAssetFile {
  const article = requireArticle(articleId, db);
  const asset = db
    .select()
    .from(articleAssets)
    .where(and(eq(articleAssets.id, assetId), eq(articleAssets.articleId, article.id)))
    .get();

  if (!asset || asset.assetType !== "inline_illustration") {
    throw new Error("正文配图资产不存在");
  }
  if (asset.status !== "ready") {
    throw new Error("正文配图资产尚未生成成功");
  }
  if (!fs.existsSync(asset.path)) {
    throw new Error("正文配图文件不存在");
  }

  return {
    asset,
    content: fs.readFileSync(asset.path),
    contentType: asset.mimeType || "application/octet-stream"
  };
}
