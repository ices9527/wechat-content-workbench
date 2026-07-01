import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateOutline, generateOutlineInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const input = generateOutlineInputSchema.parse(await readOptionalJson(request));
      const outline = await generateOutline(id, undefined, undefined, input);
      return NextResponse.json(outline);
    } catch (error) {
      return zodOrJsonError(error, "生成提纲失败");
    }
  }, { fallback: "生成提纲失败", status: 500 });
}
