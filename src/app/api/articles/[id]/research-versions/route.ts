import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listResearchVersions, saveManualResearchInputSchema, saveManualResearchVersion } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    return NextResponse.json({ researchVersions: listResearchVersions(id) });
  }, { fallback: "读取研究资料包失败", status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = saveManualResearchInputSchema.parse(await request.json());
      return NextResponse.json(saveManualResearchVersion(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "保存人工研究资料包失败");
    }
  }, { fallback: "保存人工研究资料包失败", status: 500 });
}
