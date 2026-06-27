import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady } from "@/server/articles";
import { uploadWechatDraft } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const upload = await uploadWechatDraft(id);
    return NextResponse.json(upload, { status: upload.status === "success" ? 201 : 502 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传草稿箱失败" }, { status: 400 });
  }
}
