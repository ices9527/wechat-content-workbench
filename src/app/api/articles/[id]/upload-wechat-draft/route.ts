import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady } from "@/server/articles";
import { uploadWechatDraft } from "@/server/publishing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    const upload = await uploadWechatDraft(id);
    if (upload.status === "failed") {
      return NextResponse.json(
        { error: upload.errorMessage || "上传草稿箱失败", upload },
        { status: 502 }
      );
    }
    return NextResponse.json(upload, { status: upload.status === "success" ? 201 : 502 });
  }, { fallback: "上传草稿箱失败" });
}
