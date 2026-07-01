import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, runDbsContent, runDbsContentInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = runDbsContentInputSchema.parse(await request.json());
      return NextResponse.json(await runDbsContent(id, input), { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "dbs-content 诊断失败");
    }
  }, { fallback: "dbs-content 诊断失败", status: 500 });
}
