import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { defaultStagePromptLabel, STAGE_PROMPT_STAGES, stagePromptStageSchema } from "@/domain/stages";
import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import { LOCAL_USER_ID } from "@/db/seed";
import { stagePromptDefaults, type StagePromptDefault } from "@/db/schema";

export const updateStagePromptInputSchema = z.object({
  stage: stagePromptStageSchema,
  label: z.string().trim().min(1, "名称不能为空").max(80, "名称不能超过 80 字").optional(),
  prompt: z.string().trim().max(8000, "默认提示词不能超过 8000 字").default(""),
  enabled: z.boolean().optional()
});

export type UpdateStagePromptInput = z.infer<typeof updateStagePromptInputSchema>;

export function listStagePromptDefaults(db: WorkbenchDatabase = getDatabase().db): StagePromptDefault[] {
  return db
    .select()
    .from(stagePromptDefaults)
    .where(and(eq(stagePromptDefaults.ownerId, LOCAL_USER_ID), inArray(stagePromptDefaults.stage, [...STAGE_PROMPT_STAGES])))
    .all();
}

export function getStagePromptDefault(
  stage: z.infer<typeof stagePromptStageSchema>,
  db: WorkbenchDatabase = getDatabase().db
): StagePromptDefault | null {
  return (
    db
      .select()
      .from(stagePromptDefaults)
      .where(and(eq(stagePromptDefaults.ownerId, LOCAL_USER_ID), eq(stagePromptDefaults.stage, stage)))
      .get() || null
  );
}

export function updateStagePromptDefault(
  input: UpdateStagePromptInput,
  db: WorkbenchDatabase = getDatabase().db
): StagePromptDefault {
  const parsed = updateStagePromptInputSchema.parse(input);
  const existing = getStagePromptDefault(parsed.stage, db);
  const now = new Date().toISOString();

  if (existing) {
    db.update(stagePromptDefaults)
      .set({
        label: parsed.label ?? existing.label,
        prompt: parsed.prompt,
        enabled: parsed.enabled ?? existing.enabled,
        updatedAt: now
      })
      .where(eq(stagePromptDefaults.id, existing.id))
      .run();
    return {
      ...existing,
      label: parsed.label ?? existing.label,
      prompt: parsed.prompt,
      enabled: parsed.enabled ?? existing.enabled,
      updatedAt: now
    };
  }

  const created: StagePromptDefault = {
    id: `${LOCAL_USER_ID}_${parsed.stage}`,
    ownerId: LOCAL_USER_ID,
    stage: parsed.stage,
    label: parsed.label ?? defaultStagePromptLabel(parsed.stage),
    prompt: parsed.prompt,
    enabled: parsed.enabled ?? true,
    createdAt: now,
    updatedAt: now
  };
  db.insert(stagePromptDefaults).values(created).run();
  return created;
}
