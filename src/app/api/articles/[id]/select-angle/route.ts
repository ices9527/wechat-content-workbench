import { NextRequest, NextResponse } from "next/server";

import { jsonError, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, selectAngle } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
}
