import { expect, test } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { FIXTURES, login } from "./users";

test("TESTE 2 — cadastro de veículo: CRLV, ANTT e foto; edição e download", async ({ page }) => {
  await login(page, "operador");
  await page.goto("/nova-ficha");
  await page.getByRole("link", { name: /Cadastrar veículo/ }).click();

  await page.getByTestId("input-crlv").setInputFiles(FIXTURES("crlv-ficticio.pdf"));
  await page.getByTestId("input-antt").setInputFiles(FIXTURES("antt-ficticio.pdf"));
  await page.getByTestId("input-foto_veiculo").setInputFiles(FIXTURES("foto-veiculo-ficticia.jpg"));
  await expect(page.getByTestId("slot-foto_veiculo").getByRole("img", { name: "Foto do veículo" })).toBeVisible();

  // Foto só aceita imagem: PDF é recusado no servidor
  await page.getByTestId("input-outro").setInputFiles(FIXTURES("documento-ilegivel.jpg"));
  await expect(page.getByTestId("slot-outro")).toContainText("documento-ilegivel.jpg");

  await page.getByRole("button", { name: "Processar documentos" }).click();
  await expect(page.locator("#f-placa")).toHaveValue("TST1A23", { timeout: 90_000 });
  await expect(page.locator("#f-renavam")).toHaveValue("01234567897");
  await expect(page.locator("#f-chassi")).toHaveValue("9BWZZZ377VT004251");
  await expect(page.locator("#f-capacidadeCargaKg")).toHaveValue("14500");
  await expect(page.locator("#f-rntrc")).toHaveValue("012345678");

  // Campos não identificáveis ficam disponíveis para preenchimento manual
  await expect(page.locator("#f-tipoVeiculo")).toHaveValue("");
  await page.locator("#f-tipoVeiculo").fill("Caminhão rígido");
  await page.locator("#f-tipoRodado").fill("Truck");
  await page.locator("#f-cubagemM3").fill("48");
  await page.locator("#f-tagPedagioOperadora").fill("Sem Parar");
  await page.locator("#f-tagPedagioNumero").fill("1234567890123");

  await page.getByRole("button", { name: "Gerar ficha" }).click();
  await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Salvar ficha" }).click();
  await page.waitForURL(/\/veiculos\/[0-9a-f-]{36}$/);

  // Localizar na aba de veículos, filtrar por situação
  await page.goto("/veiculos");
  await page.getByLabel("Filtrar por situação").selectOption("completo");
  await expect(page.getByText("TST1A23")).toBeVisible();
  await page.getByLabel("Pesquisar").fill("TST1A");
  await expect(page).toHaveURL(/q=TST1A/);
  await page.getByRole("link", { name: /VW 24.280/ }).click();
  await page.waitForURL(/\/veiculos\/[0-9a-f-]{36}/);

  // Editar e atualizar
  await page.getByRole("button", { name: "Editar" }).click();
  await page.locator("#f-cubagemM3").fill("52");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Alterações salvas \(versão 2\)/)).toBeVisible({ timeout: 60_000 });

  await page.reload();
  const href = await page.getByRole("link", { name: "Baixar PDF" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.body())), { mergePages: true });
  const flat = (text as string).replace(/\s+/g, " ");
  expect(flat).toContain("FICHA CADASTRAL DE VEÍCULO");
  expect(flat).toContain("52 m³");
  expect(flat).toContain("Tag de pedágio (Sem Parar): 1234567890123");
  expect(flat).toContain("CERTIFICADO DE REGISTRO E LICENCIAMENTO"); // CRLV original anexado
});

test("duplicidade de placa é alertada antes de criar novo cadastro", async ({ page }) => {
  await login(page, "operador");
  await page.goto("/nova-ficha/veiculo");
  await page.getByTestId("input-crlv").setInputFiles(FIXTURES("crlv-ficticio.pdf"));
  await page.getByTestId("input-antt").setInputFiles(FIXTURES("antt-ficticio.pdf"));
  await page.getByTestId("input-foto_veiculo").setInputFiles(FIXTURES("foto-veiculo-ficticia.jpg"));
  await page.getByRole("button", { name: "Processar documentos" }).click();
  await expect(page.getByText("Possível cadastro duplicado")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("link", { name: "Abrir cadastro existente" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).click();
  await page.getByRole("button", { name: "Descartar", exact: true }).last().click();
  await page.waitForURL(/\/nova-ficha$/);
});
