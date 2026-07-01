import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listIllustrationPlans, updateIllustrationPlan, updateIllustrationPlanInputSchema } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    return NextResponse.json({ illustrationPlans: listIllustrationPlans(id) });
  }, { fallback: "读取配图规划失败", status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = updateIllustrationPlanInputSchema.parse(await request.json());
      return NextResponse.json(updateIllustrationPlan(id, input));
    } catch (error) {
      return zodOrJsonError(error, "保存配图规划失败");
    }
  }, { fallback: "保存配图规划失败", status: 500 });
}
