import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateOutline, generateWithPromptInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = generateWithPromptInputSchema.parse(await readOptionalJson(request));
    const outline = await generateOutline(id, undefined, undefined, input);
    return NextResponse.json(outline);
  } catch (error) {
    return zodOrJsonError(error, "生成提纲失败");
  }
}
