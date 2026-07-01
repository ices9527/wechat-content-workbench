import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateAngles, generateWithPromptInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const payload = await readOptionalJson(request);
      const input = generateWithPromptInputSchema.parse(payload);
      const angles = await generateAngles(id, undefined, undefined, input);
      return NextResponse.json({ angles });
    } catch (error) {
      return zodOrJsonError(error, "生成角度失败");
    }
  }, { fallback: "生成角度失败", status: 500 });
}
