import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listIllustrationPlans, updateIllustrationPlan, updateIllustrationPlanInputSchema } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  return NextResponse.json({ illustrationPlans: listIllustrationPlans(id) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = updateIllustrationPlanInputSchema.parse(await request.json());
    return NextResponse.json(updateIllustrationPlan(id, input));
  } catch (error) {
    return zodOrJsonError(error, "保存配图规划失败");
  }
}
