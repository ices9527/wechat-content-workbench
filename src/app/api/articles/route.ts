import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { createArticle, createArticleInputSchema, ensureAppDataReady, listArticles } from "@/server/articles";
import type { ArticleStatus } from "@/domain/status";

export function GET(request: NextRequest) {
  ensureAppDataReady();
  const status = request.nextUrl.searchParams.get("status") as ArticleStatus | null;
  const articles = listArticles(status ? { status } : {});
  return NextResponse.json({ articles });
}

export async function POST(request: NextRequest) {
  ensureAppDataReady();
  try {
    const body = await request.json();
    const input = createArticleInputSchema.parse(body);
    const article = createArticle(input);
    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "创建文章失败", 500);
  }
}
