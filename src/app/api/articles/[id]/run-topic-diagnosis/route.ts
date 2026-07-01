import { NextRequest, NextResponse } from "next/server";

import { readOptionalJson, withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, runTopicDiagnosis, topicDiagnosisInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const { id } = await params;
      const payload = await readOptionalJson(request);
      const input = topicDiagnosisInputSchema.parse(payload);
      const diagnosis = await runTopicDiagnosis(id, input);
      return NextResponse.json({ diagnosis }, { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "选题诊断失败");
    }
  }, { fallback: "选题诊断失败", status: 500 });
}
