"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import type { PromptRecipe } from "@/server/prompt-recipes";

function formatTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export function PromptRecipeDialog({ recipe, onClose }: { recipe: PromptRecipe; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div aria-label="提示词配方" aria-modal="true" className="fullscreen-overlay" onClick={onClose} role="dialog">
      <section className="fullscreen-shell prompt-recipe-modal" onClick={(event) => event.stopPropagation()}>
        <div className="fullscreen-head">
          <div>
            <p className="eyebrow">{recipe.taskType || "Prompt Recipe"}</p>
            <h2>提示词配方</h2>
          </div>
          <button aria-label="关闭提示词配方" className="icon-action" onClick={onClose} title="关闭" type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="fullscreen-body prompt-recipe-body">
          {recipe.emptyReason ? <p className="notice">{recipe.emptyReason}</p> : null}

          <div className="prompt-recipe-meta">
            <span>{recipe.createdAt ? formatTime(recipe.createdAt) : "无生成时间"}</span>
            <span>{recipe.model || "无模型记录"}</span>
            <span>{recipe.status || "无状态记录"}</span>
          </div>

          <section className="prompt-recipe-section">
            <h3>默认提示词</h3>
            {recipe.stageDefaultPrompt ? (
              <div className="prompt-recipe-card">
                <strong>{recipe.stageDefaultPrompt.label}</strong>
                <pre>{recipe.stageDefaultPrompt.prompt}</pre>
              </div>
            ) : (
              <p className="subtle">没有默认提示词快照。</p>
            )}
          </section>

          <section className="prompt-recipe-section">
            <h3>上游选题诊断</h3>
            {recipe.upstreamTopicDiagnosis ? (
              <div className="prompt-recipe-card">
                <strong>诊断结论：{recipe.upstreamTopicDiagnosis.verdict}</strong>
                <p>主题快照：{recipe.upstreamTopicDiagnosis.topicSnapshot}</p>
                {recipe.upstreamTopicDiagnosis.riskSummary ? <p>主要风险：{recipe.upstreamTopicDiagnosis.riskSummary}</p> : null}
                {recipe.upstreamTopicDiagnosis.nextAction ? <p>下一步建议：{recipe.upstreamTopicDiagnosis.nextAction}</p> : null}
              </div>
            ) : (
              <p className="subtle">没有使用上游选题诊断。</p>
            )}
          </section>

          <section className="prompt-recipe-section">
            <h3>可选提示词</h3>
            {recipe.selectedRequirements.length > 0 ? (
              <div className="prompt-recipe-list">
                {recipe.selectedRequirements.map((requirement) => (
                  <details className="prompt-recipe-card" key={requirement.id}>
                    <summary>
                      <strong>{requirement.label}</strong>
                      <small>{requirement.stableKey}</small>
                    </summary>
                    <pre>{requirement.promptFragment}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <p className="subtle">没有可选提示词快照。</p>
            )}
          </section>

          <section className="prompt-recipe-section">
            <h3>对当前文章的要求</h3>
            {recipe.customInstruction ? <pre className="prompt-recipe-card">{recipe.customInstruction}</pre> : <p className="subtle">没有本次要求。</p>}
          </section>

          <section className="prompt-recipe-section">
            <details>
              <summary>最终提示词</summary>
              {recipe.finalPrompt ? <pre className="prompt-recipe-final">{recipe.finalPrompt}</pre> : <p className="subtle">没有最终提示词记录。</p>}
            </details>
          </section>
        </div>
      </section>
    </div>
  );
}
