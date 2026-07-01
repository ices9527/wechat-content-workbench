import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, requireArticleAssetFile } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id, assetId } = await params;
      const file = requireArticleAssetFile(id, assetId);
      return new NextResponse(new Uint8Array(file.content), {
        headers: {
          "Content-Type": file.contentType,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return zodOrJsonError(error, "读取资产失败");
    }
  }, { fallback: "读取资产失败", status: 500 });
}
