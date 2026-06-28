import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady } from "@/server/articles";
import { uploadWechatDraft } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const upload = await uploadWechatDraft(id);
    return NextResponse.json(upload, { status: upload.status === "success" ? 201 : 502 });
  } catch (error) {
    return zodOrJsonError(error, "上传草稿箱失败");
  }
}
