# dbs-topic-diagnosis Spec

Spec version: Sprint 10C-D, 2026-06-28

This document is the publishable workbench spec for `dbs-topic-diagnosis`.

The deployed workbench does not execute the user's local Codex skill at `/Users/ice9527/.codex/skills/dbs-topic-diagnosis`. The deployed workbench runs its own `topic_diagnosis` prompt, schema, database records, and AI invocation history. Keep this spec, the local skill, and the runtime prompt aligned.

## Purpose

`dbs-topic-diagnosis` answers one question before writing:

Is this topic worth entering the WeChat article production pipeline now?

It does not write the article, generate angles, generate outlines, generate titles, generate covers, or rewrite drafts.

## Boundary With dbs-content

| Capability | Timing | Object | Main Question |
| --- | --- | --- | --- |
| `dbs-topic-diagnosis` | before writing | topic and topic brief | Is this worth writing, and how should the topic be sharpened first? |
| `dbs-content` | after draft exists | draft content | Is this content good, clean, efficient, and worth publishing? |

If both a topic and a draft exist, this spec only governs topic validity. Draft-level diagnosis belongs to `dbs-content`.

## Runtime Inputs

| Field | Meaning |
| --- | --- |
| topic | Proposed topic or title-like idea. |
| targetReader | Concrete reader whose decision, risk, or situation the article serves. |
| coreProblem | Reader's concrete question, friction, risk, or decision. |
| hotAnchor | Timely hook, news, product change, policy change, or reason to read now. |
| customInstruction | User's current constraints for this run. |
| selectedRequirementIds | Workbench requirement preset ids selected in the topic prompt settings popup. |

Missing fields should not crash diagnosis. They should be treated as `未填写` and reflected in the checks.

## Verdict Contract

Return exactly one verdict.

| Verdict | Use When | Pipeline Effect |
| --- | --- | --- |
| `pass` | Reader, problem, timeliness, and actionability are all concrete enough. | Continue to angle generation. |
| `revise` | The topic is valid but needs sharpening before writing. | Continue with warning or revise brief first. |
| `hold` | There is not enough reader/problem/material evidence, or the topic requires research before writing. | Block downstream generation until clarified. |
| `drop` | The topic is only a hot spot, pure data explanation, false promise, or not aligned with the account. | Stop this topic. |

## Diagnosis Dimensions

### Target Reader Specificity

Check whether the topic points to a concrete reader who can recognize their own situation.

Strong examples:

- "正在安排香港账户和跨境资金路径的家庭"
- "给孩子做教育金规划、但不确定现金流边界的家庭"
- "已经有境外身份规划但担心合规路径的家庭"

Weak examples:

- "中产家庭"
- "想理财的人"
- "关注香港账户的人"

### Real Reader Problem

Check whether the topic answers a real reader problem rather than presenting a data source, policy, product, or industry topic.

Strong questions:

- "这件事会改变我家的资金路径吗？"
- "这个账户还能不能作为家庭现金流安排的一部分？"
- "这个工具适合什么边界，不适合什么边界？"

Weak topics:

- "香港账户政策解读"
- "跨境支付工具介绍"
- "某产品最近很火"

### Reason To Open Today

Check why the reader should open this article now. A hot event is only an entry; it must translate into the reader's current decision, risk, or action.

Strong:

- A rule, channel, product, or social event changes a family decision boundary.
- The reader has a near-term action and may make a costly mistake.
- The topic reframes a hot event into a concrete household question.

Weak:

- Only "最近很火".
- Only "大家都在讨论".
- Only "政策有变化" without reader impact.

### Actionability, Boundary, Or Decision Value

Check whether the article can end with a useful judgment, boundary, or next action.

Strong:

- A boundary: when to use, when not to use.
- A path: what to check first, what to defer.
- A risk recognition frame.
- A family decision checklist.

Weak:

- More background knowledge.
- More industry explanation.
- Generic "be careful".

## Topic Requirement Presets

The workbench seeds these topic-stage optional requirements.

Default selected:

1. Target reader is specific.
2. Real reader problem exists.
3. There is a reason to open today.
4. The topic lands in family decision, boundary, risk recognition, or action.

Optional:

5. Do not only chase hot spots.
6. Do not become data or encyclopedia explanation.
7. Do not imply certain outcomes for speed, return, identity, approval, account opening, or similar matters.
8. There is a concrete forwarding recipient and reason.

Selected requirements must be inserted into the final prompt and recorded through `ai_invocation_requirements`.

## Output JSON

The AI response must normalize to:

```json
{
  "verdict": "pass | revise | hold | drop",
  "targetReaderCheck": "string",
  "readerProblemCheck": "string",
  "timelinessCheck": "string",
  "actionabilityCheck": "string",
  "riskSummary": "string",
  "suggestionsMarkdown": "string",
  "nextAction": "string"
}
```

Field rules:

- `verdict`: one of `pass`, `revise`, `hold`, `drop`.
- `targetReaderCheck`: specific reader judgment.
- `readerProblemCheck`: real problem judgment.
- `timelinessCheck`: why-now judgment.
- `actionabilityCheck`: decision/action/boundary judgment.
- `riskSummary`: concise risks. Do not praise.
- `suggestionsMarkdown`: concrete fixes before writing. Do not write the article.
- `nextAction`: one sentence action, not broad advice.

## Human Report Shape

The local skill can return a Markdown report:

```markdown
# 选题诊断：{topic}

## 结论
- verdict: revise
- 一句话判断：这个选题方向成立，但现在还像资料主题，需要先压到具体家庭决策。

## 四项检查
| 维度 | 判断 | 说明 |
| --- | --- | --- |
| 目标读者 | 需要补强 | ... |
| 真实问题 | 基本成立 | ... |
| 今天点开理由 | 不足 | ... |
| 行动性/边界 | 需要补强 | ... |

## 主要风险
- ...

## 修改建议
- ...

## 下一步
先把主题改成一个家庭正在做的具体判断题。
```

## Runtime Alignment Checklist

When changing this spec, check:

- `src/server/prompts.ts`: `topic_diagnosis` prompt.
- `src/db/seed.ts`: topic-stage requirement presets.
- `src/server/articles.ts`: selected requirements and `runTopicDiagnosis`.
- `src/server/ai-normalizers.ts` and `src/server/ai.ts`: output schema and normalization.
- `tests/e2e/topic-diagnosis.spec.ts`: browser flow.
- `src/server/articles-basic.test.ts` and `src/server/prompts.test.ts`: service and prompt coverage.
- `/Users/ice9527/.codex/skills/dbs-topic-diagnosis`: local Codex skill mirror.

## Style

- Be direct and editorial.
- Do not flatter the topic.
- Avoid generic advice.
- Prefer one sharp judgment over many soft suggestions.
- Give action, not advice.
