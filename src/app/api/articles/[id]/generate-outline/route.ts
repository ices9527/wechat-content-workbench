import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, generateOutline, generateWithPromptInputSchema } from "@/server/articles";

async function readOptionalJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = generateWithPromptInputSchema.parse(await readOptionalJson(request));
    const outline = await generateOutline(id, undefined, undefined, input);
    return NextResponse.json(outline);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成提纲失败" }, { status: 400 });
  }
}
