import { NextRequest, NextResponse } from "next/server";

import { jsonError, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { acceptOutline, ensureAppDataReady } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const body = (await request.json()) as { outlineId?: string };
      if (!body.outlineId) {
        return jsonError(new Error("outlineId 必填"));
      }
      return NextResponse.json(acceptOutline(id, body.outlineId));
    } catch (error) {
      return zodOrJsonError(error, "确认提纲失败");
    }
  }, { fallback: "确认提纲失败", status: 500 });
}
