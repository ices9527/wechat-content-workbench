import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createRequirementInputSchema,
  createRequirementPreset,
  deleteRequirementPreset,
  ensureAppDataReady,
  listRequirementPresets,
  requirementStageSchema,
  updateRequirementInputSchema,
  updateRequirementPreset
} from "@/server/articles";

export async function GET(request: NextRequest) {
  ensureAppDataReady();
  try {
    const stageParam = request.nextUrl.searchParams.get("stage");
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const stage = stageParam ? requirementStageSchema.parse(stageParam) : undefined;
    return NextResponse.json({ requirements: listRequirementPresets({ stage, includeArchived }) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "阶段不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取可选提示词失败" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  ensureAppDataReady();
  try {
    const input = createRequirementInputSchema.parse(await request.json());
    return NextResponse.json(createRequirementPreset(input), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "新增可选提示词失败" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  ensureAppDataReady();
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "必须指定可选提示词" }, { status: 400 });
    }
    const input = updateRequirementInputSchema.parse(await request.json());
    return NextResponse.json(updateRequirementPreset(id, input));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "输入不合法" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新可选提示词失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  ensureAppDataReady();
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "必须指定可选提示词" }, { status: 400 });
    }
    return NextResponse.json(deleteRequirementPreset(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除可选提示词失败" }, { status: 400 });
  }
}
