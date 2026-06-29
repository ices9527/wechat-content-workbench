import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateIllustrationPlan, generateIllustrationPlanInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = generateIllustrationPlanInputSchema.parse(await readOptionalJson(request));
    const plan = await generateIllustrationPlan(id, input);
    return NextResponse.json(plan);
  } catch (error) {
    return zodOrJsonError(error, "生成配图规划失败");
  }
}
