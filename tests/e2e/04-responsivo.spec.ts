import { expect, test } from "@playwright/test";
import { login } from "./users";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("interface responsiva em celular (sem rolagem horizontal)", async ({ page }) => {
  await login(page, "operador");
  for (const path of ["/", "/motoristas", "/veiculos", "/nova-ficha", "/nova-ficha/motorista"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("link", { name: "Fichas de veículos" }).last()).toBeVisible();
  await page.getByRole("link", { name: "Fichas de veículos" }).last().click();
  await expect(page).toHaveURL(/\/veiculos/);
});
