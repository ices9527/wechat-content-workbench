import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, markFinalDraft, markFinalDraftInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = markFinalDraftInputSchema.parse(await request.json());
      return NextResponse.json(markFinalDraft(id, input));
    } catch (error) {
      return zodOrJsonError(error, "标记最终稿失败");
    }
  }, { fallback: "标记最终稿失败", status: 500 });
}
