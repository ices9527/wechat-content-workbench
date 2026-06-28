import { NextRequest, NextResponse } from "next/server";

import { zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, markReadyToPublish } from "@/server/articles";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  try {
    const { id } = await params;
    return NextResponse.json(markReadyToPublish(id));
  } catch (error) {
    return zodOrJsonError(error, "标记待发布失败");
  }
}
