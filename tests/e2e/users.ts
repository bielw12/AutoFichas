import path from "node:path";
import type { Page } from "@playwright/test";

/** Usuários criados apenas no banco isolado de testes E2E. */
export const E2E_USERS = {
  admin: { name: "Admin E2E", email: "admin@e2e.local", password: "SenhaAdmin123", role: "admin" },
  operador: { name: "Operadora E2E", email: "operador@e2e.local", password: "SenhaOperador123", role: "operador" },
  visualizador: { name: "Visualizador E2E", email: "visualizador@e2e.local", password: "SenhaVisual123", role: "visualizador" },
} as const;

export const FIXTURES = (name: string) => path.resolve("test-results/fixtures-e2e", name);

export async function login(page: Page, who: keyof typeof E2E_USERS) {
  const u = E2E_USERS[who];
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(u.email);
  await page.getByLabel("Senha").fill(u.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function logout(page: Page) {
  await page.locator("aside").first().getByRole("button", { name: /E2E/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(/\/login/);
}
