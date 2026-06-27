import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, listStagePromptDefaults, updateStagePromptDefault, updateStagePromptInputSchema } from "@/server/articles";

export async function GET() {
  ensureAppDataReady();
  return NextResponse.json({ prompts: listStagePromptDefaults() });
}

export async function PATCH(request: NextRequest) {
  ensureAppDataReady();
  try {
    const input = updateStagePromptInputSchema.parse(await request.json());
    return NextResponse.json(updateStagePromptDefault(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存默认提示词失败" }, { status: 400 });
  }
}
