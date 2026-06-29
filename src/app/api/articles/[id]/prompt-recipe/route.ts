import { NextRequest, NextResponse } from "next/server";

import { jsonError, zodOrJsonError } from "@/app/api/_utils/route-errors";
import {
  ensureAppDataReady,
  getPromptRecipeForAIStyleCheck,
  getPromptRecipeForDraft,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  getPromptRecipeForResearch,
  getPromptRecipeForTopicDiagnosis
} from "@/server/articles";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAppDataReady();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const outlineVersionId = searchParams.get("outlineVersionId");
    const draftVersionId = searchParams.get("draftVersionId");
    const topicDiagnosisId = searchParams.get("topicDiagnosisId");
    const researchVersionId = searchParams.get("researchVersionId");
    const aiStyleCheckId = searchParams.get("aiStyleCheckId");
    const invocationId = searchParams.get("invocationId");
    const specifiedCount = [outlineVersionId, draftVersionId, topicDiagnosisId, researchVersionId, aiStyleCheckId, invocationId].filter(Boolean).length;

    if (specifiedCount !== 1) {
      return jsonError(new Error("必须且只能指定一个版本或调用 ID"));
    }

    const recipe = outlineVersionId
      ? getPromptRecipeForOutline(id, outlineVersionId)
      : draftVersionId
        ? getPromptRecipeForDraft(id, draftVersionId)
        : topicDiagnosisId
          ? getPromptRecipeForTopicDiagnosis(id, topicDiagnosisId)
          : researchVersionId
            ? getPromptRecipeForResearch(id, researchVersionId)
            : aiStyleCheckId
              ? getPromptRecipeForAIStyleCheck(id, aiStyleCheckId)
              : getPromptRecipeForInvocation(id, invocationId as string);

    return NextResponse.json({ recipe });
  } catch (error) {
    return zodOrJsonError(error, "读取提示词配方失败");
  }
}
