import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady } from "@/server/articles";
import { listStagePromptDefaults, updateStagePromptDefault, updateStagePromptInputSchema } from "@/server/stage-prompts";

export async function GET() {
  return withJsonErrorBoundary(() => {
    ensureAppDataReady();
    return NextResponse.json({ prompts: listStagePromptDefaults() });
  }, { fallback: "读取默认提示词失败", status: 500 });
}

export async function PATCH(request: NextRequest) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const input = updateStagePromptInputSchema.parse(await request.json());
      return NextResponse.json(updateStagePromptDefault(input));
    } catch (error) {
      return zodOrJsonError(error, "保存默认提示词失败");
    }
  }, { fallback: "保存默认提示词失败", status: 500 });
}
