import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
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
    return zodOrJsonError(error, "创建角度失败");
  }
}
