import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady } from "@/server/articles";
import { generateCoverAssets } from "@/server/publishing";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("coverSource");
      if (file instanceof File && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        return NextResponse.json(
          generateCoverAssets(id, { filename: file.name, mimeType: file.type, buffer }),
          { status: 201 }
        );
      }
    }
    return NextResponse.json(generateCoverAssets(id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成封面失败" }, { status: 400 });
  }
}
