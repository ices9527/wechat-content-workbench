import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, reviseFromDiagnosis, reviseFromDiagnosisInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = reviseFromDiagnosisInputSchema.parse(await request.json());
    return NextResponse.json(await reviseFromDiagnosis(id, input), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "生成修改稿失败");
  }
}
