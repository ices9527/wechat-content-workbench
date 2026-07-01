import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, runPublishHTMLAIStyleCheck, runPublishHTMLAIStyleCheckInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = runPublishHTMLAIStyleCheckInputSchema.parse(await request.json());
      return NextResponse.json(await runPublishHTMLAIStyleCheck(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "发布 HTML 文案清洁检查失败");
    }
  }, { fallback: "发布 HTML 文案清洁检查失败", status: 500 });
}
