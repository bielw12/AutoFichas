import { expect, test } from "@playwright/test";
import { FIXTURES, login, logout } from "./users";

test("TESTE 3 — sessão: sair e entrar novamente mantém os cadastros", async ({ page }) => {
  await page.goto("/motoristas");
  await expect(page).toHaveURL(/\/login\?next=%2Fmotoristas/);
  await page.getByLabel("E-mail").fill("operador@e2e.local");
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  await login(page, "operador");
  await logout(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await login(page, "operador");
  await page.goto("/motoristas");
  await expect(page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" })).toBeVisible();
  await page.goto("/veiculos");
  await expect(page.getByText("TST1A23")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Motoristas cadastrados")).toBeVisible();
});

test("documentos privados: exigem sessão e URL assinada do próprio usuário", async ({ page, browser }) => {
  await login(page, "operador");
  await page.goto("/motoristas");
  await page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: /Documentos/ }).click();
  await page.getByTestId("slot-comprovante_residencia").getByRole("button", { name: /Visualizar/ }).click();
  const url = await page.getByRole("dialog").getByRole("link", { name: "Abrir em nova aba" }).getAttribute("href");
  expect(url).toMatch(/^\/api\/files\/doc\/[0-9a-f-]{36}\?exp=\d+&sig=/);

  const ok = await page.request.get(url!);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect(ok.headers()["cache-control"]).toContain("no-store");

  const tampered = await page.request.get(url!.replace(/sig=[^&]+/, "sig=assinatura-falsa"));
  expect(tampered.status()).toBe(403);

  const anon = await browser.newContext();
  const anonRes = await anon.request.get(new URL(url!, page.url()).toString());
  expect(anonRes.status()).toBe(401);
  await anon.close();

  // Outro usuário autenticado não pode reutilizar a URL assinada
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await login(viewer, "visualizador");
  const reuse = await viewer.request.get(new URL(url!, page.url()).toString());
  expect(reuse.status()).toBe(403);
  await viewerCtx.close();
});

test("visualizador: somente consulta e download, sem operações administrativas", async ({ page }) => {
  await login(page, "visualizador");
  await expect(page.getByRole("link", { name: "Nova ficha cadastral" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lixeira" })).toHaveCount(0);

  await page.goto("/lixeira");
  await expect(page).toHaveURL(/erro=permissao/);
  await expect(page.getByText("Você não tem permissão")).toBeVisible();
  await page.goto("/nova-ficha/motorista");
  await expect(page).toHaveURL(/erro=permissao/);

  await page.goto("/configuracoes");
  await expect(page.getByRole("tab", { name: /Sistema e identidade/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Usuários/ })).toHaveCount(0);

  await page.goto("/motoristas");
  await page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}/);
  const recordId = page.url().split("/").pop()!;
  await expect(page.getByRole("tab", { name: /Editar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
  await expect(page.getByText("•••.456.789-••").first()).toBeVisible(); // CPF mascarado
  await expect(page.getByText("123.456.789-09")).toHaveCount(0);

  // Download permitido
  const pdf = await page.request.get((await page.getByRole("link", { name: "Baixar PDF" }).getAttribute("href"))!);
  expect(pdf.status()).toBe(200);

  // Operações de escrita negadas no servidor
  const upload = await page.request.post(`/api/records/driver/${recordId}/documents`, {
    headers: { origin: new URL(page.url()).origin },
    multipart: { docType: "cnh", file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") } },
  });
  expect(upload.status()).toBe(403);
  const proc = await page.request.post(`/api/records/driver/${recordId}/process`, { headers: { origin: new URL(page.url()).origin }, data: {} });
  expect(proc.status()).toBe(403);
  const gen = await page.request.post(`/api/records/driver/${recordId}/pdf`, { headers: { origin: new URL(page.url()).origin } });
  expect(gen.status()).toBe(403);

  // Exportação respeita a máscara mesmo pedindo "completo"
  const csv = await page.request.get("/api/export/driver?full=1");
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain("•••.456.789-••");
  expect(body).not.toContain("123.456.789-09");
});

test("requisições de outra origem são bloqueadas (CSRF)", async ({ page }) => {
  await login(page, "operador");
  await page.goto("/motoristas");
  await page.getByRole("link", { name: "JOAO TESTE FICTICIO DA SILVA" }).click();
  await page.waitForURL(/\/motoristas\/[0-9a-f-]{36}/);
  const recordId = page.url().split("/").pop()!;
  const res = await page.request.post(`/api/records/driver/${recordId}/pdf`, { headers: { origin: "https://site-malicioso.example" } });
  expect(res.status()).toBe(403);
});

test("administrador: exclusão com confirmação, lixeira e restauração", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/veiculos");
  await page.getByRole("button", { name: /Ações para VW 24.280/ }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("lixeira");
  await page.getByRole("button", { name: "Mover para a lixeira" }).click();
  await expect(page.getByText("Ficha movida para a lixeira.")).toBeVisible();
  await expect(page.getByText("TST1A23")).toHaveCount(0);

  await page.getByRole("link", { name: "Lixeira" }).click();
  await expect(page.getByText(/VW 24.280/)).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Ficha restaurada.")).toBeVisible();
  await page.goto("/veiculos");
  await expect(page.getByText("TST1A23")).toBeVisible();

  // Configurações administrativas disponíveis
  await page.goto("/configuracoes");
  await expect(page.getByRole("tab", { name: /Sistema e identidade/ })).toBeVisible();

  // Logotipo e informações padrão do sistema → barra lateral e rodapé das fichas
  await page.getByTestId("logo-input").setInputFiles(FIXTURES("logo-ficticio.png"));
  await expect(page.getByText("Logotipo atualizado.")).toBeVisible();
  await page.getByLabel("Nome da transportadora").fill("Transportes Fictícios E2E");
  await page.getByRole("button", { name: "Salvar informações e aparência" }).click();
  await expect(page.getByText(/Configurações salvas/)).toBeVisible();
  await page.reload();
  await expect(page.locator("aside").first().getByRole("img", { name: "Transportes Fictícios E2E" })).toBeVisible();

  await page.getByRole("tab", { name: /Usuários/ }).click();
  await expect(page.getByText("visualizador@e2e.local")).toBeVisible();
});
