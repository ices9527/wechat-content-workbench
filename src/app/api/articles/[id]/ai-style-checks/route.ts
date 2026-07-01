import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary } from "@/app/api/_utils/route-errors";
import { ensureAppDataReady, listAIStyleChecks } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    const { id } = await params;
    return NextResponse.json({ checks: listAIStyleChecks(id) });
  }, { fallback: "读取文案清洁检查失败", status: 500 });
}
