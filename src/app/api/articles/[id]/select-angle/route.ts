import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady, selectAngle } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const body = (await request.json()) as { angleId?: string };
    if (!body.angleId) {
      return NextResponse.json({ error: "angleId 必填" }, { status: 400 });
    }
    const angle = selectAngle(id, body.angleId);
    return NextResponse.json(angle);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "选择角度失败" }, { status: 400 });
  }
}
