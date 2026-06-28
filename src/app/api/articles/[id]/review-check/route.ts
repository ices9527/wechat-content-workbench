import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, reviewCheckInputSchema, runReviewCheck } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const payload = await readOptionalJson(request);
    const input = reviewCheckInputSchema.parse(payload);
    return NextResponse.json(await runReviewCheck(id, input), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "生成复盘检查清单失败");
  }
}
