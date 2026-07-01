import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady } from "@/server/articles";
import { renderWechatHtmlAsset } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      return NextResponse.json(renderWechatHtmlAsset(id), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "生成 HTML 失败");
    }
  }, { fallback: "生成 HTML 失败", status: 500 });
}
