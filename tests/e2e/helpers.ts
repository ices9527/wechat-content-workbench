import { expect, type Locator, type Page } from "@playwright/test";

export async function expectNoRuntimeErrorOverlay(page: Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Cannot find module");
  await expect(page.locator("body")).not.toContainText("vendor-chunks/drizzle-orm.js");
}

export async function expectPromptDialogScrollable(dialog: Locator) {
  const body = dialog.locator(".prompt-config-body, .prompt-recipe-body");
  await expect(body).toBeVisible();
  await expect(body).toHaveCSS("overflow-y", "scroll");
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBeTruthy();
}

export async function selectWorkflowTab(page: Page, workspace: string, tabName: RegExp) {
  await page.getByRole("button", { name: workspace, exact: true }).click();
  const tab = page.getByRole("tab", { name: tabName });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
