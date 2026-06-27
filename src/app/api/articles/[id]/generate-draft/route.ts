import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, generateDraft, generateWithPromptInputSchema } from "@/server/articles";

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
    const draft = await generateDraft(id, undefined, undefined, input);
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成文案失败" }, { status: 400 });
  }
}
