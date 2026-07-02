import { describe, expect, it } from "vitest";

import { extractMarkdownAnchors, resolveInlineIllustrationPosition } from "./inline-illustration-anchors";

const markdown = [
  "# 香港账户还能不能开？真正变了的不是开户，是资金路径",
  "",
  "跨境支付通最容易被看见的变化，是快。",
  "",
  "## 二、真正变紧的，是银行对资金路径的持续观察",
  "",
  "一笔钱进入香港账户以后，银行真正关心的不是它有没有进来，而是它从哪里来、为什么来、之后去哪里。",
  "",
  "- 资金来源是否解释得通。",
  "- 用途是否和身份、职业、家庭安排相符。",
  "",
  "## 三、普通家庭要把四类钱分开讲",
  "",
  "很多家庭并没有真实用途，问题在于表达太散。"
].join("\n");

describe("inline illustration anchors", () => {
  it("extracts headings, paragraphs and list items from markdown", () => {
    expect(extractMarkdownAnchors(markdown)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchor: "香港账户还能不能开？真正变了的不是开户，是资金路径",
          matchType: "heading",
          lineIndex: 0
        }),
        expect.objectContaining({
          anchor: "二、真正变紧的，是银行对资金路径的持续观察",
          matchType: "heading",
          lineIndex: 4
        }),
        expect.objectContaining({
          anchor: "资金来源是否解释得通。",
          matchType: "list_item",
          lineIndex: 8
        })
      ])
    );
  });

  it("matches a heading with Chinese corner brackets", () => {
    expect(resolveInlineIllustrationPosition(markdown, "插入在「二、真正变紧的，是银行对资金路径的持续观察」中")).toEqual(
      expect.objectContaining({
        status: "matched",
        anchor: "二、真正变紧的，是银行对资金路径的持续观察",
        placement: "after",
        matchType: "heading",
        lineIndex: 4,
        warning: null
      })
    );
  });

  it("matches a heading before or after with Chinese double quotes", () => {
    expect(resolveInlineIllustrationPosition(markdown, "在“二、真正变紧的，是银行对资金路径的持续观察”之前")).toEqual(
      expect.objectContaining({
        status: "matched",
        placement: "before",
        lineIndex: 4
      })
    );

    expect(resolveInlineIllustrationPosition(markdown, "在“二、真正变紧的，是银行对资金路径的持续观察”之后")).toEqual(
      expect.objectContaining({
        status: "matched",
        placement: "after",
        lineIndex: 4
      })
    );
  });

  it("prefers a paragraph anchor when both heading and paragraph are provided", () => {
    expect(
      resolveInlineIllustrationPosition(
        markdown,
        "插入在「二、真正变紧的，是银行对资金路径的持续观察」中，段落「一笔钱进入香港账户」之后"
      )
    ).toEqual(
      expect.objectContaining({
        status: "matched",
        placement: "after",
        matchType: "paragraph",
        lineIndex: 6,
        anchor: "一笔钱进入香港账户"
      })
    );
  });

  it("matches list item anchors", () => {
    expect(resolveInlineIllustrationPosition(markdown, "段落「资金来源是否解释得通」之后")).toEqual(
      expect.objectContaining({
        status: "matched",
        placement: "after",
        matchType: "list_item",
        lineIndex: 8
      })
    );
  });

  it("falls back to heading when a specific paragraph is missing", () => {
    expect(
      resolveInlineIllustrationPosition(
        markdown,
        "插入在「二、真正变紧的，是银行对资金路径的持续观察」中，段落「不存在的段落」之后"
      )
    ).toEqual(
      expect.objectContaining({
        status: "fallback",
        placement: "after",
        matchType: "heading",
        lineIndex: 4,
        anchor: "二、真正变紧的，是银行对资金路径的持续观察",
        warning: expect.stringContaining("回退")
      })
    );
  });

  it("reports unmatched positions with the original position", () => {
    expect(resolveInlineIllustrationPosition(markdown, "放在“不存在的小标题”之后")).toEqual(
      expect.objectContaining({
        status: "unmatched",
        placement: "after",
        matchType: "none",
        lineIndex: null,
        warning: expect.stringContaining("不存在的小标题")
      })
    );
  });

  it("handles empty markdown and empty position", () => {
    expect(resolveInlineIllustrationPosition("", "在“标题”之后")).toEqual(
      expect.objectContaining({
        status: "unmatched",
        lineIndex: null
      })
    );
    expect(resolveInlineIllustrationPosition(markdown, "")).toEqual(
      expect.objectContaining({
        status: "unmatched",
        warning: "插入位置为空"
      })
    );
  });
});
