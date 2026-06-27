import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createManualAngle, ensureAppDataReady, listAngles, manualAngleInputSchema } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  return NextResponse.json({ angles: listAngles(id) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = manualAngleInputSchema.parse(await request.json());
    const angle = createManualAngle(id, input);
    return NextResponse.json(angle, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建角度失败" }, { status: 400 });
  }
}
