import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, reviseFromAIStyleCheck, reviseFromAIStyleCheckInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = reviseFromAIStyleCheckInputSchema.parse(await request.json());
      return NextResponse.json(await reviseFromAIStyleCheck(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "生成清洁版文案失败");
    }
  }, { fallback: "生成清洁版文案失败", status: 500 });
}
