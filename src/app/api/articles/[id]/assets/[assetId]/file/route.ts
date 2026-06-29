import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, requireInlineIllustrationAssetFile } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  ensureAppDataReady();
  try {
    const { id, assetId } = await params;
    const file = requireInlineIllustrationAssetFile(id, assetId);
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return zodOrJsonError(error, "读取正文配图失败");
  }
}
