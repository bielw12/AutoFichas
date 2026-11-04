# Arquitetura

## Visão geral

```
Navegador (React 19 / Next.js App Router)
   │  Server Components (leitura)      Server Actions (mutações simples)
   │  Route Handlers: upload multipart · processamento IA (stream NDJSON) · PDF · arquivos assinados · CSV
   ▼
Camada de serviços (src/server/services)  ── regras de negócio, versões, auditoria, status
   │                 │                    │
   ▼                 ▼                    ▼
PostgreSQL       Storage privado       Pipeline de IA (src/server/ai)
(Drizzle)        local | Supabase       provedores: anthropic | openai | local (Tesseract)
                 + AES-256-GCM          │
                                        ▼
                               Geração de PDF (src/server/pdf)
                               HTML/CSS → Chromium (Playwright) → pdf-lib (anexa originais + rodapé)
```

Princípios:

- **Tudo sensível roda no servidor.** O navegador nunca recebe chaves, caminhos de storage ou URLs do Supabase. Arquivos só saem pela rota `/api/files/*` com sessão + assinatura temporária.
- **Fonte única de verdade para campos.** `src/lib/extraction-schemas.ts` (o que a IA extrai de cada documento) e `src/lib/fields.ts` (campos da ficha, seções, obrigatoriedade, sensibilidade e **origens** de cada campo) dirigem o prompt, o JSON Schema, a validação, o formulário, a mesclagem e o PDF.
- **Provedores intercambiáveis.** Todo provedor implementa `ExtractionProvider.extract()` e devolve o mesmo formato; pós-processamento, confiança e regras ficam fora do provedor.
- **IA sugere, humano confirma.** Nenhum valor extraído é tratado como oficial; cada campo carrega status de confiança e origem; a ficha só é salva após conferência.

## Pipeline de documentos

| Etapa | Onde |
|---|---|
| 1. Receber o arquivo | `POST /api/records/[kind]/[id]/documents` (multipart) |
| 2. Validar formato e tamanho | `server/files/validate.ts` — magic bytes, limite, PDF sem conteúdo ativo/senha, imagem decodificável, ClamAV opcional |
| 3. Armazenar o original | `server/storage` — chave por motorista/veículo, criptografia AES‑256‑GCM |
| 4. Identificar o tipo | provedor devolve `document_type_detected` + `matches_expected`; OCR local usa assinaturas de texto |
| 5. Extrair texto e elementos visuais | Claude/OpenAI leem PDF e imagem nativamente; local: camada de texto do PDF (unpdf) ou OCR Tesseract (com `pdftoppm` para PDFs digitalizados) |
| 6. Interpretar | prompt com regras + orientações por documento (`server/ai/prompt.ts`) |
| 7. Estruturar em JSON | JSON Schema estrito por documento (`buildJsonSchema`) via *tool use* (Claude) ou *structured outputs* (OpenAI); validação com Zod |
| 8. Validar | `lib/normalize.ts` — CPF/CNPJ/Renavam/registro CNH (dígitos), datas, UF, CEP, placa, chassi, enums; correção de caracteres ambíguos apenas em campos numéricos |
| 9. Atribuir confiança | `server/ai/postprocess.ts` — verde (≥ 0,85 e válido), amarelo (conferir), vermelho (ausente/inválido) |
| 10. Conferência humana | `lib/merge.ts` aplica sugestões sem sobrescrever edições; `lib/inconsistencies.ts` aponta divergências entre documentos |

O processamento é transmitido em tempo real (NDJSON) com eventos por documento: `preparando → analisando → validando → concluido | erro`. Não há percentual fictício: a interface mostra etapas e um indicador indeterminado.

Os resultados ficam em `extraction_results` (provedor, modelo, tipo detectado, legibilidade, campos com valor bruto/normalizado/confiança/notas, alertas, campos ausentes, tempo). Cada campo da ficha guarda em `field_meta` a origem (`docType`, campo, `extractionId`, documentos) — rastreabilidade exigida.

**Reprocessamento inteligente:** só os tipos cujos arquivos mudaram são reprocessados (`pendingDocTypes`). Na ficha existente, a interface mostra apenas os campos daquela origem que divergem dos atuais, e o usuário escolhe o que aplicar; campos corrigidos manualmente vêm desmarcados.

## Geração do PDF

1. Os dados são lidos **do banco** (nunca do formulário) e renderizados em HTML/CSS (`server/pdf/templates.ts`), com fontes embutidas e JavaScript/rede desabilitados na página.
2. Chromium headless gera o PDF A4, reservando a margem inferior para a faixa institucional.
3. `pdf-lib` (`server/pdf/assemble.ts`) monta o documento final: ficha → (página "Dados bancários") → documentos originais na ordem definida. Páginas de PDF são incorporadas como objetos vetoriais (sem perda), respeitando rotação; imagens são convertidas (HEIC → JPEG, orientação EXIF) e encaixadas sem distorção, em página retrato ou paisagem conforme a proporção.
4. A faixa institucional (cores, telefones, site, e-mails, logotipo) e a numeração "Página X de Y" são desenhadas em todas as páginas. Opcionalmente, as páginas originais podem ser anexadas sem nenhuma alteração.
5. O PDF é armazenado e vinculado à versão da ficha (`record_versions.pdf_storage_key`); versões anteriores continuam disponíveis.

## Modelo de dados

```
users ─┬─< sessions
       ├─< audit_logs (somente inclusão)
       └─< (created_by/updated_by em várias tabelas)

company_settings (linha única)

drivers ─┬─< documents ─┬─< extraction_results
vehicles ┘              │
   │                    └─ (document_ids jsonb para grupos frente/verso)
   └─< record_versions (snapshot + campos alterados + mudanças de documentos + PDF)

login_attempts (proteção contra força bruta)
```

| Tabela | Destaques |
|---|---|
| `users` | e-mail único (case-insensitive), hash scrypt, perfil (`admin`/`operador`/`visualizador`), ativo, troca obrigatória de senha |
| `sessions` | id = SHA‑256 do token; expiração; IP/UA |
| `drivers` / `vehicles` | colunas tipadas por campo (datas como `date`), `is_draft`, `base_status`, `review_pending`, `field_meta`, `acknowledged_issues`, PDF atual, versão, `archived_at` (lixeira). Índices únicos parciais: CPF; placa; Renavam (somente cadastros ativos e finalizados) |
| `documents` | tipo, nome original higienizado, chave de storage, mime real, tamanho, SHA‑256, páginas, status do processamento, `superseded_at` (histórico); `CHECK` garante dono único (motorista **ou** veículo) |
| `extraction_results` | ver pipeline |
| `record_versions` | número sequencial único por cadastro |
| `audit_logs` | ação, entidade, usuário, IP, detalhes **sem dados pessoais** |
| `company_settings` | identidade visual e políticas (vencimento, retenção, IA externa) |

### Situação dos cadastros

`base_status` é persistido a cada alteração (rascunho → documentação pendente → incompleto → aguardando conferência → completo). A situação exibida combina a base com as datas de validade calculadas **na data atual** (SQL `CASE` em `effectiveStatusSql`), de modo que filtros como "vencido" ou "próximo do vencimento" ficam sempre corretos. Datas ausentes nunca geram "vencido" nem "válido".

## Autorização

| Permissão | Admin | Operador | Visualizador |
|---|:-:|:-:|:-:|
| Consultar fichas e baixar PDF | ✔ | ✔ | ✔ |
| Criar/editar fichas, enviar documentos, processar IA, gerar PDF | ✔ | ✔ | |
| Ver dados sensíveis sem máscara | ✔ | ✔ | |
| Salvar ficha sem todos os documentos | ✔ | | |
| Excluir, lixeira, exclusão definitiva | ✔ | | |
| Configurações, usuários, auditoria, exportação completa | ✔ | | |

Matriz em `src/lib/permissions.ts`; verificada em `requirePageUser` / `requireUser` em cada página, Server Action e Route Handler.
