import { expect, test } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { FIXTURES, login } from "./users";

async function pdfText(buf: Buffer) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}

test("TESTE 1 — cadastro de motorista: upload, IA, conferência, PDF, edição e novo download", async ({ page }) => {
  await login(page, "operador");

  // Nova ficha → Motorista
  await page.getByRole("link", { name: "Nova ficha cadastral" }).click();
  await page.getByRole("link", { name: /Cadastrar motorista/ }).click();
  await expect(page.getByRole("heading", { name: "Cadastro de motorista" })).toBeVisible();

  // Etapa 1 — upload dos documentos
  const processar = page.getByRole("button", { name: "Processar documentos" });
  await expect(processar).toBeDisabled();
  await page.getByTestId("input-cnh").setInputFiles(FIXTURES("cnh-ficticia.pdf"));
  await expect(page.getByTestId("slot-cnh")).toContainText("cnh-ficticia.pdf");
  await expect(page).toHaveURL(/\?id=[0-9a-f-]{36}/);
  await page.getByTestId("input-comprovante_residencia").setInputFiles(FIXTURES("comprovante-ficticio.png"));
  await page.getByTestId("input-dados_bancarios").setInputFiles(FIXTURES("dados-bancarios-ficticios.jpg"));
  await expect(page.getByTestId("slot-dados_bancarios")).toContainText("Enviado");
  await expect(page.getByTestId("slot-comprovante_residencia")).toContainText("PNG");

  // Etapa 2 — processamento por IA (OCR local no ambiente de teste)
  await processar.click();

  // Etapa 3 — conferência: campos preenchidos automaticamente
  await expect(page.locator("#f-nome")).toHaveValue("JOAO TESTE FICTICIO DA SILVA", { timeout: 90_000 });
  await expect(page.locator("#f-cpf")).toHaveValue("123.456.789-09");
  await expect(page.locator("#f-cnhValidade")).toHaveValue("2031-08-20");
  await expect(page.locator("#f-cep")).toHaveValue("13010-100");
  await expect(page.locator("#f-bancoNome")).toHaveValue("Banco do Brasil");

  // Ao focar um campo, o documento de origem aparece ao lado
  await page.locator("#f-cpf").focus();
  await expect(page.locator("aside").last()).toContainText("cnh-ficticia.pdf");

  // Validação de formato
  await page.locator("#f-telefonePrincipal").fill("123");
  await expect(page.getByText("Telefone inválido — use DDD + número")).toBeVisible();

  // Correções do usuário
  await page.locator("#f-telefonePrincipal").fill("11988887777");
  await expect(page.locator("#f-telefonePrincipal")).toHaveValue("(11) 98888-7777");
  await page.locator("#f-contatoComercialNome").fill("Fulano");
  await page.locator("#f-naturalidade").fill("Campinas, SP");
  await page.locator("#f-enderecoVinculo").selectOption("proprio");
  await page.locator("#f-titularVinculo").selectOption("motorista");

  // Voltar uma etapa não perde dados
  const etapas = page.getByRole("list", { name: "Etapas do cadastro" });
  await etapas.getByRole("button", { name: /Documentos/ }).click();
  await expect(page.getByTestId("slot-cnh")).toBeVisible();
  await etapas.getByRole("button", { name: /Conferência/ }).click();
  await expect(page.locator("#f-contatoComercialNome")).toHaveValue("Fulano");

  // Etapa 4 — prévia e geração
  await page.getByRole("button", { name: "Gerar ficha" }).click();
  await expect(page.getByTestId("pdf-preview")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/5 páginas/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar ficha" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Ficha salva com sucesso!")).toBeVisible();

  // Gerenciamento: localizar a ficha na aba de motoristas
  await page.getByRole("link", { name: "Fichas de motoristas" }).first().click();
  await page.getByLabel("Pesquisar").fill("teste ficticio");
  await expect(page).toHaveURL(/q=teste/);
  await expect(page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" })).toBeVisible();
  await expect(page.getByText("•••.456.789-••")).toBeVisible(); // CPF mascarado na tabela
  await page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}/);
  await expect(page.getByText("Completo").first()).toBeVisible();
  await expect(page.getByText("Campinas, SP")).toBeVisible();

  // Editar uma informação
  await page.getByRole("tab", { name: /Editar/ }).click();
  await page.locator("#f-telefoneSecundario").fill("11977776666");
  await page.locator("#f-contatoOperacionalNome").fill("Ciclano");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Alterações salvas \(versão 2\)/)).toBeVisible({ timeout: 60_000 });

  // Baixar novamente o PDF regenerado e conferir os dados efetivamente salvos
  await page.reload();
  const href = await page.getByRole("link", { name: "Baixar PDF" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const text = await pdfText(Buffer.from(await res.body()));
  expect(text).toContain("FICHA CADASTRAL DE MOTORISTA");
  expect(text).toContain("(11) 97777-6666 / Ciclano (operacional)");
  expect(text).toContain("DOCUMENTO FICTÍCIO PARA TESTES"); // CNH original anexada

  // Histórico com as duas versões
  await page.getByRole("tab", { name: /Histórico/ }).click();
  await expect(page.getByText("Cadastro inicial")).toBeVisible();
  await expect(page.getByText("Edição de dados")).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF v1" })).toBeVisible();
});

test("documento substituído pode ser reprocessado sem perder os demais dados", async ({ page }) => {
  await login(page, "operador");
  await page.goto("/motoristas");
  await page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: /Documentos/ }).click();
  const slot = page.getByTestId("slot-cnh");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), slot.getByRole("button", { name: /Substituir cnh-ficticia.pdf/ }).click()]);
  await chooser.setFiles(FIXTURES("cnh-ficticia-renovada.pdf"));
  await expect(slot).toContainText("cnh-ficticia-renovada.pdf");
  await page.getByRole("button", { name: /Reprocessar CNH/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Validade", { timeout: 60_000 });
  await expect(page.getByRole("dialog")).toContainText("20/08/2036");
  await page.getByRole("button", { name: /Aplicar 1 selecionado/ }).click();
  await expect(page.getByText(/1 campo\(s\) atualizado\(s\)/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: /Dados/ }).click();
  await expect(page.getByText("20/08/2036")).toBeVisible();
  await expect(page.getByText("Campinas, SP")).toBeVisible(); // dado corrigido manualmente preservado
});
