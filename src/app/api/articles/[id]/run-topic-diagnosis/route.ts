import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, runTopicDiagnosis, topicDiagnosisInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const input = topicDiagnosisInputSchema.parse(payload);
    const diagnosis = await runTopicDiagnosis(id, input);
    return NextResponse.json({ diagnosis }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "选题诊断失败" }, { status: 400 });
  }
}
