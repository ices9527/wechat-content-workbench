import { NextRequest, NextResponse } from "next/server";

import { jsonError, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, selectAngle } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const body = (await request.json()) as { angleId?: string };
      if (!body.angleId) {
        return jsonError(new Error("angleId 必填"));
      }
      const angle = selectAngle(id, body.angleId);
      return NextResponse.json(angle);
    } catch (error) {
      return zodOrJsonError(error, "选择角度失败");
    }
  }, { fallback: "选择角度失败", status: 500 });
}
