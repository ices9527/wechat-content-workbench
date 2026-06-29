import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, generateInlineIllustration, generateInlineIllustrationInputSchema } from "@/server/articles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    const input = generateInlineIllustrationInputSchema.parse(await request.json());
    const asset = await generateInlineIllustration(id, input);
    return NextResponse.json(asset);
  } catch (error) {
    return zodOrJsonError(error, "生成正文配图失败");
  }
}
