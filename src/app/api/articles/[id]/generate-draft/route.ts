import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateDraft, generateWithPromptInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = generateWithPromptInputSchema.parse(await readOptionalJson(request));
      const draft = await generateDraft(id, undefined, undefined, input);
      return NextResponse.json(draft);
    } catch (error) {
      return zodOrJsonError(error, "生成文案失败");
    }
  }, { fallback: "生成文案失败", status: 500 });
}
