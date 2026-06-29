import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, reviseFromAIStyleCheck, reviseFromAIStyleCheckInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = reviseFromAIStyleCheckInputSchema.parse(await request.json());
    return NextResponse.json(await reviseFromAIStyleCheck(id, input), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "生成清洁版文案失败");
  }
}
