"use client";

import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { RequirementPreset } from "@/db/schema";
import type { RequirementStage } from "@/domain/stages";

import { RequirementSelector, type RequirementEditorInput } from "./requirement-selector";
import { STAGE_PROMPT_UI } from "./prompt-ui";

export function StagePromptDialog({
  title,
  stage,
  defaultPromptLabel,
  defaultPrompt,
  onDefaultPromptChange,
  onSaveDefaultPrompt,
  requirements,
  selectedIds,
  onSelectedIdsChange,
  pending,
  onCreate,
  onUpdate,
  onDelete
}: {
  title: string;
  stage: RequirementStage;
  defaultPromptLabel: string;
  defaultPrompt: string;
  onDefaultPromptChange: (value: string) => void;
  onSaveDefaultPrompt: () => Promise<void>;
  requirements: RequirementPreset[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  pending: boolean;
  onCreate: (input: RequirementEditorInput) => Promise<void>;
  onUpdate: (id: string, input: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const stageUi = STAGE_PROMPT_UI[stage];
  const activeCount = requirements.filter((requirement) => requirement.enabled && !requirement.archivedAt).length;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        aria-label={`打开${title}`}
        className="prompt-config-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Settings2 aria-hidden="true" size={17} />
        <span>
          <strong>提示词设置</strong>
          <small>
            已选 {selectedIds.length} / 可用 {activeCount}
          </small>
        </span>
      </button>

      {open ? (
        <div aria-label={title} aria-modal="true" className="fullscreen-overlay" onClick={() => setOpen(false)} role="dialog">
          <section className="fullscreen-shell prompt-config-modal" onClick={(event) => event.stopPropagation()}>
            <div className="fullscreen-head">
              <div>
                <p className="eyebrow">{stageUi.eyebrow}</p>
                <h2>{title}</h2>
              </div>
              <button className="icon-action" onClick={() => setOpen(false)} title="关闭" type="button" aria-label="关闭提示词设置">
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="fullscreen-body prompt-config-body">
              <section className="prompt-config-section">
                <div className="prompt-config-section-head">
                  <h3>默认提示词</h3>
                  <button className="button secondary" disabled={pending} onClick={onSaveDefaultPrompt} type="button">
                    保存默认提示词
                  </button>
                </div>
                <label className="field">
                  <span className="label">{defaultPromptLabel}</span>
                  <textarea
                    className="textarea prompt-textarea"
                    value={defaultPrompt}
                    onChange={(event) => onDefaultPromptChange(event.target.value)}
                  />
                </label>
              </section>

              <RequirementSelector
                title="可选提示词"
                stage={stage}
                requirements={requirements}
                selectedIds={selectedIds}
                onChange={onSelectedIdsChange}
                pending={pending}
                onCreate={onCreate}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
