import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady } from "@/server/articles";
import { renderWechatHtmlAsset } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    return NextResponse.json(renderWechatHtmlAsset(id), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "生成 HTML 失败");
  }
}
