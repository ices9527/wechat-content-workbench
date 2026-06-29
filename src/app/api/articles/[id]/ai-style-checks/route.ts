import { NextRequest, NextResponse } from "next/server";

import { ensureAppDataReady, listAIStyleChecks } from "@/server/articles";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  return NextResponse.json({ checks: listAIStyleChecks(id) });
}
