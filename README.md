# AutoFichas

Sistema web para **criar, gerenciar, armazenar e consultar fichas cadastrais de motoristas e veículos** de transportadoras, com extração automática de dados por IA.

> **Fluxo central:** o usuário envia os documentos → a IA interpreta → o sistema organiza os dados → o usuário confere e corrige → o sistema gera a ficha em PDF com os documentos originais anexados.

| | |
|---|---|
| **Stack** | Next.js 15 (App Router, Server Actions, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 · componentes no padrão shadcn/ui (Radix) |
| **Banco** | PostgreSQL (local ou **Supabase**) · Drizzle ORM · migrations versionadas |
| **Arquivos** | Armazenamento privado (disco local ou **Supabase Storage**) com criptografia AES‑256‑GCM opcional |
| **IA / OCR** | Arquitetura de provedores intercambiáveis: **Anthropic Claude** (recomendado), **OpenAI** ou **OCR local Tesseract** |
| **PDF** | HTML/CSS renderizado no servidor via Chromium (Playwright) + `pdf-lib` para anexar os originais |
| **Testes** | Vitest (unitários + integração com PostgreSQL real) · Playwright (ponta a ponta) |

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Requisitos](#requisitos)
3. [Instalação e execução local](#instalação-e-execução-local)
4. [Banco de dados e migrations](#banco-de-dados-e-migrations)
5. [Supabase](#supabase)
6. [Inteligência artificial](#inteligência-artificial)
7. [Armazenamento de arquivos](#armazenamento-de-arquivos)
8. [Testes](#testes)
9. [Deploy](#deploy)
10. [Segurança e LGPD](#segurança-e-lgpd)
11. [Estrutura do projeto](#estrutura-do-projeto)

Documentação complementar: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · [`docs/INTEGRACOES-E-APIS.md`](docs/INTEGRACOES-E-APIS.md)

---

## Funcionalidades

- **Dashboard** com indicadores reais: totais de motoristas e veículos, fichas recentes, cadastros incompletos, documentos pendentes/vencidos, vencimentos próximos e atividades recentes.
- **Nova ficha** em 4 etapas com indicador de progresso (é possível voltar sem perder dados; o rascunho é salvo no servidor e pode ser retomado):
  1. **Upload** por documento (arrastar e soltar ou selecionar), PDF/JPG/PNG/WEBP/HEIC, múltiplos arquivos (frente e verso, extratos), progresso real de envio, substituir/remover.
  2. **Processamento por IA** com etapas reais (sem percentual fictício): identificação do tipo, extração, validação.
  3. **Conferência** em formulário por seções com **semáforo de confiança** (verde/amarelo/vermelho), origem de cada dado, **visualização do documento original ao lado** ao focar o campo, validações de formato (CPF, CNPJ, CEP, datas, telefone, placa, Renavam, chassi), **detecção de inconsistências** entre documentos e de **duplicidade** (CPF, placa, Renavam).
  4. **Prévia** do PDF no próprio navegador; salvar, gerar novamente, baixar ou voltar para editar.
- **PDF da ficha** no padrão visual das referências: título em destaque, onda azul, faixa institucional (telefone, site, e-mails, logotipo) em todas as páginas, página "Dados bancários" e, em seguida, **os documentos originais** (todas as páginas de PDFs preservadas em vetor; imagens sem distorção, foto do veículo em página inteira).
- **Gerenciamento** separado de motoristas e veículos: pesquisa, filtro por situação, ordenação, paginação, visualizar, editar campos isolados, substituir documentos, **reprocessar só o documento substituído** (com escolha campo a campo do que aplicar), baixar PDF, excluir (lixeira com restauração), exportar CSV.
- **Histórico de versões** (data, usuário, campos alterados, documentos adicionados/substituídos/removidos e PDFs de cada versão) e **registro de auditoria**.
- **Situações calculadas**: Completo, Incompleto, Aguardando conferência, Documentação pendente, Próximo do vencimento, Documento vencido — sem presumir validade quando a data não existe.
- **Configurações**: nome, CNPJ, telefones, e-mails, site, endereço, rodapé, cores e logotipo da ficha (tudo dinâmico, nada fixo no código); usuários e perfis; autorização LGPD de IA externa; política de retenção.
- **Perfis**: Administrador, Operador e Visualizador.

---

## Requisitos

- **Node.js 20.11+** (testado com 22) e npm
- **PostgreSQL 14+** (local, Docker ou Supabase)
- **Chromium** para gerar PDFs no servidor: `npx playwright install chromium` (ou defina `PDF_CHROMIUM_EXECUTABLE`)
- Opcional: `poppler-utils` (`pdftoppm`) para OCR local de PDFs digitalizados; ClamAV para antivírus.

---

## Instalação e execução local

```bash
git clone <repositório> autofichas
```

```bash
cd autofichas
```

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
cp .env.example .env
```

Edite o `.env` e preencha no mínimo `APP_SECRET`, `DATABASE_URL`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e (recomendado) `STORAGE_ENCRYPTION_KEY`. Os comandos para gerar segredos estão comentados no próprio arquivo.

Banco PostgreSQL local rápido com Docker (opcional):

```bash
docker run -d --name autofichas-db -e POSTGRES_USER=autofichas -e POSTGRES_PASSWORD=autofichas -e POSTGRES_DB=autofichas -p 5432:5432 postgres:16
```

Aplique as migrations e crie o administrador inicial:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Inicie em modo de desenvolvimento:

```bash
npm run dev
```

Acesse `http://localhost:3000` e entre com o e-mail/senha do administrador definidos no `.env`. Em **Configurações**, cadastre os dados e o logotipo da transportadora e crie os demais usuários.

Produção local:

```bash
npm run build
```

```bash
npm run start
```

---

## Banco de dados e migrations

- Schema em `src/server/db/schema.ts` (Drizzle, colunas em `snake_case`).
- Migrations SQL versionadas em `drizzle/`:
  - `0000_init.sql` — tabelas, enums, chaves estrangeiras, índices (inclusive **índices únicos parciais** que impedem duplicidade de CPF/placa/Renavam entre cadastros ativos).
  - `0001_security_policies.sql` — **RLS habilitado em todas as tabelas sem políticas permissivas**, revogação de privilégios dos papéis públicos do Supabase (`anon`, `authenticated`), trigger que torna `audit_logs` somente inclusão e linha única de configurações.

Comandos:

| Comando | O que faz |
|---|---|
| `npm run db:migrate` | aplica as migrations pendentes |
| `npm run db:generate` | gera nova migration a partir de mudanças no schema |
| `npm run db:seed` | cria o administrador inicial (se não houver usuários) |
| `npm run maintenance` | executa a rotina de retenção (agende diariamente) |

Entidades: `users`, `sessions`, `login_attempts`, `company_settings`, `drivers`, `vehicles`, `documents`, `extraction_results`, `record_versions`, `audit_logs`. Detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Supabase

O Supabase é suportado como **banco PostgreSQL** e **Storage privado**. A autenticação é feita pela própria aplicação (sessões no servidor, senhas com scrypt), o que mantém o controle de perfis no backend e permite rodar o sistema também fora do Supabase.

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **Banco:** *Project Settings → Database → Connection string → URI* (modo **Session**, porta 5432). Use em `DATABASE_URL` e defina `DATABASE_SSL=true`.
3. **Storage:** crie um bucket **privado** (ex.: `autofichas-documentos`) — ou deixe a aplicação criá-lo automaticamente como privado no primeiro upload. A aplicação recusa operar com bucket público.
4. No `.env`:
   ```
   STORAGE_DRIVER=supabase
   SUPABASE_URL=https://<projeto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role — somente no servidor>
   SUPABASE_STORAGE_BUCKET=autofichas-documentos
   ```
5. Rode `npm run db:migrate` e `npm run db:seed` apontando para o Supabase.

A migration de segurança habilita RLS sem políticas e revoga acesso de `anon`/`authenticated`, então **a API REST pública do Supabase não expõe nenhuma tabela**. O navegador nunca recebe chaves nem URLs do Supabase: arquivos são servidos pela rota autenticada `/api/files/*`.

---

## Inteligência artificial

Selecione o provedor com `AI_PROVIDER`:

| Valor | Variáveis | Observações |
|---|---|---|
| `anthropic` (recomendado) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`) | Lê PDFs (inclusive digitalizados) e fotos nativamente; resposta estruturada via *tool use* com JSON Schema por documento. |
| `openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão `gpt-4.1`) | Chat Completions com *Structured Outputs*; PDFs enviados como arquivo. Ajuste o modelo conforme sua conta. |
| `local` | — (opcional `OCR_LANG_PATH`) | Tesseract (português) + regras para documentos brasileiros. **Nenhum dado sai do servidor.** Precisão menor; todos os campos ficam amarelos (conferir); não analisa a foto do veículo. |
| `none` (padrão) | — | Sem extração automática. A interface informa claramente que a integração precisa ser configurada e permite preenchimento manual. **Nenhuma extração é simulada.** |

**LGPD:** com provedores externos (`anthropic`/`openai`), um **administrador precisa autorizar** o envio em *Configurações → Inteligência artificial* após avaliar o contrato/termos de tratamento do provedor. Sem essa autorização nenhum documento é enviado.

Regras implementadas: nunca inventar valores (campos ausentes ficam vazios e vermelhos); correção de caracteres ambíguos (0/O, 1/I, 5/S, 8/B) apenas em campos numéricos e sempre marcada para conferência; validação de formato e dígitos verificadores; detecção de documento ilegível ou de tipo diferente do esperado; divergências entre documentos; origem de cada dado registrada. Detalhes em [`docs/INTEGRACOES-E-APIS.md`](docs/INTEGRACOES-E-APIS.md).

---

## Armazenamento de arquivos

| `STORAGE_DRIVER` | Onde ficam os arquivos |
|---|---|
| `local` (padrão) | `STORAGE_LOCAL_DIR` (padrão `./storage`), fora de `public/`, permissões `0600` |
| `supabase` | bucket privado do Supabase Storage |

- `STORAGE_ENCRYPTION_KEY` (32 bytes em base64) ativa **criptografia AES‑256‑GCM** de todos os arquivos (documentos, PDFs e logotipo), em qualquer driver. **Guarde a chave com segurança** — sem ela os arquivos não podem ser lidos.
- Separação lógica: `motoristas/<id>/documentos/…`, `motoristas/<id>/fichas/…`, `veiculos/<id>/…`, `configuracoes/…`.
- Limites: `MAX_UPLOAD_MB` (padrão 15) e `MAX_FILES_PER_DOCUMENT` (padrão 10).
- Antivírus opcional: `CLAMAV_HOST`/`CLAMAV_PORT` (clamd). Se configurado e indisponível, o upload é bloqueado.

---

## Testes

Os testes usam **somente documentos fictícios gerados por código** (`tests/fixtures/documents.ts`).

Unitários + integração (requer PostgreSQL; usa o banco `DATABASE_URL_TEST`, padrão `postgres://autofichas:autofichas@localhost:5432/autofichas_test`):

```bash
npm test
```

Ponta a ponta no navegador (compila e sobe o servidor em `:3100` com banco `DATABASE_URL_E2E`, padrão `.../autofichas_e2e`, e provedor de IA `local`):

```bash
npm run test:e2e
```

Cobertura: validações; normalização e confiança da extração; documentos ilegíveis e incompatíveis; inconsistências; provedores Anthropic/OpenAI (requisição e parsing); OCR local; upload e bloqueio de arquivos maliciosos; criptografia; URLs assinadas; auditoria sem dados sensíveis; geração do PDF (páginas, A4, rotação, imagens, dados salvos); cadastro completo de motorista e veículo; edição que preserva os demais campos; substituição + reprocessamento apenas do documento alterado; pesquisa e filtros; duplicidade; lixeira/restauração/exclusão definitiva com remoção dos arquivos; login/logout e persistência; permissões do visualizador; proteção de arquivos privados; CSRF; layout responsivo.

---

## Deploy

A geração de PDF usa Chromium no servidor, portanto prefira um ambiente com **contêiner ou VM** (Railway, Render, Fly.io, AWS ECS/App Runner, Google Cloud Run, VPS). Um `Dockerfile` pronto está na raiz:

```bash
docker build -t autofichas .
```

```bash
docker run -p 3000:3000 --env-file .env autofichas
```

Passos:

1. Provisione o PostgreSQL (ex.: Supabase) e o Storage privado.
2. Configure as variáveis de ambiente do `.env.example` no provedor (nunca versione o `.env`). Use `APP_URL` com **https**.
3. Execute `npm run db:migrate` (e `npm run db:seed` na primeira vez) apontando para o banco de produção.
4. Agende `npm run maintenance` diariamente (cron do provedor, GitHub Actions ou similar).
5. Sirva sempre atrás de HTTPS (criptografia em trânsito). Os cabeçalhos de segurança (HSTS, CSP, X-Frame-Options, etc.) já são enviados pela aplicação.

> Plataformas serverless (ex.: Vercel) exigem um Chromium compatível com o ambiente (`PDF_CHROMIUM_EXECUTABLE`) e limites de tempo adequados para processamento de IA; por isso a recomendação é contêiner.

---

## Segurança e LGPD

- Autenticação com senhas **scrypt**, sessões com token aleatório guardado apenas em **hash** no banco, cookie `httpOnly` + `SameSite=Lax` (+ `Secure` com HTTPS), limite de tentativas de login.
- **Perfis** verificados no servidor em toda página, Server Action e rota de API (o middleware é só a primeira barreira).
- Arquivos privados servidos por **URLs temporárias assinadas (HMAC, 10 min) vinculadas ao usuário** + sessão obrigatória; `Cache-Control: no-store`.
- Validação do **conteúdo real** dos arquivos (magic bytes), bloqueio de PDFs com JavaScript/anexos/ações, PDFs protegidos, imagens inválidas; limites de tamanho e quantidade; antivírus opcional.
- Dados pessoais e bancários **mascarados** em tabelas, exportações e para o perfil Visualizador; revelação explícita registrada em auditoria.
- **Logs de auditoria sem CPF, chaves PIX ou dados bancários** (apenas nomes de campos e metadados), somente inclusão.
- Verificação de origem (CSRF) nas rotas de escrita; CSP e demais cabeçalhos de segurança.
- **Retenção configurável**: rascunhos inativos, lixeira e documentos substituídos são removidos (dados e arquivos) após os prazos definidos.
- Chaves de API apenas em variáveis de ambiente do servidor; envio a IA externa só após autorização do administrador.

---

## Estrutura do projeto

```
drizzle/                 migrations SQL
scripts/                 migrate, seed, maintenance
src/
  app/                   rotas (App Router)
    (app)/               área autenticada: dashboard, nova-ficha, motoristas, veiculos, configuracoes, lixeira
    actions/             Server Actions (auth, records, admin)
    api/                 uploads, processamento (stream), PDF, arquivos assinados, exportação, health
    login/
  components/            UI (ui/ = primitivos shadcn/Radix; wizard/, detail/, records/, settings/)
  lib/                   código compartilhado: tipos de documento, campos, validações, schemas de extração,
                         confiança, mesclagem, inconsistências, situação, permissões
  server/                somente servidor
    ai/                  pipeline, prompt, pós-processamento, provedores (anthropic, openai, local-ocr)
    auth/                senhas e sessões
    db/                  conexão e schema
    files/               validação e conversão de imagens
    pdf/                 templates, renderização (Chromium) e montagem (pdf-lib)
    services/            regras de negócio (cadastros, documentos, ficha, dashboard, usuários, retenção)
    storage/             drivers local/Supabase + criptografia
tests/
  fixtures/              gerador de documentos fictícios
  unit/  integration/  e2e/
```
