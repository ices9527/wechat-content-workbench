import { NextResponse } from "next/server";

const LEGACY_REVISION_DISABLED_MESSAGE = "基于 dbs-content 诊断生成修改稿已下线，请使用文案清洁检查生成清洁版文案。";

export async function POST() {
  return NextResponse.json({ error: LEGACY_REVISION_DISABLED_MESSAGE }, { status: 410 });
}
