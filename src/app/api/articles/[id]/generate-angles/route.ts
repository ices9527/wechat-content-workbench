import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureAppDataReady, generateAngles, generateWithPromptInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const input = generateWithPromptInputSchema.parse(payload);
    const angles = await generateAngles(id, undefined, undefined, input);
    return NextResponse.json({ angles });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成角度失败" }, { status: 400 });
  }
}
