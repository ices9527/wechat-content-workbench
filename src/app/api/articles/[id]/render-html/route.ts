import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady } from "@/server/articles";
import { renderWechatHtmlAsset } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    return NextResponse.json(renderWechatHtmlAsset(id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成 HTML 失败" }, { status: 400 });
  }
}
