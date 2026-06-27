import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady, getArticle, updateArticle } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  const article = getArticle(id);
  if (!article) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json(article);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  const body = (await request.json()) as Record<string, string | undefined>;
  const article = updateArticle(id, {
    topic: body.topic,
    targetReader: body.targetReader,
    coreProblem: body.coreProblem,
    hotAnchor: body.hotAnchor
  });

  if (!article) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  return NextResponse.json(article);
}
