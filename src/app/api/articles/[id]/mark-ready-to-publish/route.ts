import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady, markReadyToPublish } from "@/server/articles";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    return NextResponse.json(markReadyToPublish(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "标记待发布失败" }, { status: 400 });
  }
}
