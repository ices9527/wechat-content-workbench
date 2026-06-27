import { NextRequest, NextResponse } from "next/server";

import {
  ensureAppDataReady,
  getPromptRecipeForDraft,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline
} from "@/server/articles";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAppDataReady();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const outlineVersionId = searchParams.get("outlineVersionId");
    const draftVersionId = searchParams.get("draftVersionId");
    const invocationId = searchParams.get("invocationId");
    const specifiedCount = [outlineVersionId, draftVersionId, invocationId].filter(Boolean).length;

    if (specifiedCount !== 1) {
      return NextResponse.json({ error: "必须且只能指定一个版本或调用 ID" }, { status: 400 });
    }

    const recipe = outlineVersionId
      ? getPromptRecipeForOutline(id, outlineVersionId)
      : draftVersionId
        ? getPromptRecipeForDraft(id, draftVersionId)
        : getPromptRecipeForInvocation(id, invocationId as string);

    return NextResponse.json({ recipe });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取提示词配方失败" }, { status: 400 });
  }
}
