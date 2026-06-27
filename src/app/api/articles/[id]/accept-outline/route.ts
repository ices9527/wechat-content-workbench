import { NextRequest, NextResponse } from "next/server";

import { acceptOutline, ensureAppDataReady } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const body = (await request.json()) as { outlineId?: string };
    if (!body.outlineId) {
      return NextResponse.json({ error: "outlineId 必填" }, { status: 400 });
    }
    return NextResponse.json(acceptOutline(id, body.outlineId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认提纲失败" }, { status: 400 });
  }
}
