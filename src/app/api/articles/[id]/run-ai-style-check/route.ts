import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, runAIStyleCheck, runAIStyleCheckInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = runAIStyleCheckInputSchema.parse(await request.json());
    return NextResponse.json(await runAIStyleCheck(id, input), { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "文案清洁检查失败");
  }
}
