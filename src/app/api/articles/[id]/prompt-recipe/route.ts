import { NextRequest, NextResponse } from "next/server";

import { jsonError, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import {
  ensureAppDataReady,
  getPromptRecipeForAIStyleCheck,
  getPromptRecipeForDraft,
  getPromptRecipeForIllustrationPlan,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  getPromptRecipeForResearch,
  getPromptRecipeForTopicDiagnosis
} from "@/server/articles";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const searchParams = request.nextUrl.searchParams;
      const outlineVersionId = searchParams.get("outlineVersionId");
      const draftVersionId = searchParams.get("draftVersionId");
      const topicDiagnosisId = searchParams.get("topicDiagnosisId");
      const researchVersionId = searchParams.get("researchVersionId");
      const aiStyleCheckId = searchParams.get("aiStyleCheckId");
      const illustrationPlanId = searchParams.get("illustrationPlanId");
      const invocationId = searchParams.get("invocationId");
      const specifiedCount = [
        outlineVersionId,
        draftVersionId,
        topicDiagnosisId,
        researchVersionId,
        aiStyleCheckId,
        illustrationPlanId,
        invocationId
      ].filter(Boolean).length;

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
                : illustrationPlanId
                  ? getPromptRecipeForIllustrationPlan(id, illustrationPlanId)
                  : getPromptRecipeForInvocation(id, invocationId as string);

      return NextResponse.json({ recipe });
    } catch (error) {
      return zodOrJsonError(error, "读取提示词配方失败");
    }
  }, { fallback: "读取提示词配方失败", status: 500 });
}
