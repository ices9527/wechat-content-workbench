import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { confirmIllustrationPlan, confirmIllustrationPlanInputSchema, ensureAppDataReady } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = confirmIllustrationPlanInputSchema.parse(await request.json());
      const plan = confirmIllustrationPlan(id, input);
      return NextResponse.json(plan);
    } catch (error) {
      return zodOrJsonError(error, "确认配图规划失败");
    }
  }, { fallback: "确认配图规划失败", status: 500 });
}
