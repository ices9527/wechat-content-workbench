import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
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
    return zodOrJsonError(error, "保存默认提示词失败");
  }
}
