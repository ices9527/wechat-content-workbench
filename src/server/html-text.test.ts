import { describe, expect, it } from "vitest";

import { htmlToPlainText } from "./html-text";

describe("html text extraction", () => {
  it("extracts readable text from generated WeChat HTML", () => {
    const text = htmlToPlainText(`
      <article class="wechat-article">
        <h1>香港账户 &amp; 资金路径</h1>
        <p>真正变化不是开户速度。</p>
        <ul><li>生活费</li><li>学费</li></ul>
        <script>window.hidden = true</script>
      </article>
    `);

    expect(text).toContain("香港账户 & 资金路径");
    expect(text).toContain("真正变化不是开户速度。");
    expect(text).toContain("生活费");
    expect(text).toContain("学费");
    expect(text).not.toContain("window.hidden");
  });
});
