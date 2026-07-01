import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, prePublishCheckInputSchema, runPrePublishCheck } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const payload = await readOptionalJson(request);
      const input = prePublishCheckInputSchema.parse(payload);
      return NextResponse.json(await runPrePublishCheck(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "生成发布前检查摘要失败");
    }
  }, { fallback: "生成发布前检查摘要失败", status: 500 });
}
