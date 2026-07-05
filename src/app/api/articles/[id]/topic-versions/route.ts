import { NextRequest, NextResponse } from "next/server";

import { jsonError, withJsonErrorBoundary } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, getArticle, listTopicVersions } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    const article = getArticle(id);
    if (!article) {
      return jsonError(new Error("文章不存在"), { status: 404 });
    }

    return NextResponse.json({ versions: listTopicVersions(id) });
  }, { fallback: "读取主题版本历史失败", status: 500 });
}
