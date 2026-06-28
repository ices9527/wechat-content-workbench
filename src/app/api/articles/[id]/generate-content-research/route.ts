import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateContentResearch, generateContentResearchInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = generateContentResearchInputSchema.parse(await readOptionalJson(request));
    const research = await generateContentResearch(id, input);
    return NextResponse.json(research, { status: 201 });
  } catch (error) {
    return zodOrJsonError(error, "生成内容研究资料包失败");
  }
}
