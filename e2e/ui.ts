import { expect, type Page } from "@playwright/test";

export async function navigate(page: Page, name: string) {
  await expect(page.locator(".modal-navigation")).toHaveCount(0);
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page.locator(".modal-navigation")).toHaveCount(0);
}

export async function chooseWorkFilter(
  page: Page,
  label: string,
  option: string,
) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const menu = page.getByRole("dialog", { name: `${label} options` });
  await menu.getByText(option, { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
}

export async function openHourSettings(page: Page) {
  const toggle = page.getByRole("button", {
    name: /^(Hour settings and breakdowns|Hide hour settings)$/,
  });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
