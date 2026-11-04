# Integrações e APIs

## Provedores de IA

### Escolha e avaliação

| Critério | Anthropic Claude | OpenAI (multimodal) | Google Document AI / Azure Document Intelligence / AWS Textract | OCR local (Tesseract) |
|---|---|---|---|---|
| Documentos brasileiros (CNH, CRLV, ANTT, contas) | Muito boa — interpreta layout e contexto, sem treinamento | Muito boa | Boa leitura de texto; exigem processadores customizados para mapear campos de documentos brasileiros | Regular — depende de qualidade da imagem e de regras |
| PDF digitalizado e fotos | Nativo (PDF e imagem) | Nativo | Nativo | Requer rasterização |
| Saída estruturada | *Tool use* com JSON Schema | *Structured Outputs* | JSON próprio de cada serviço + mapeamento | Regras próprias |
| Privacidade | Dados saem do servidor (exige autorização LGPD) | Idem | Idem | Nada sai do servidor |
| Custo | Por token | Por token | Por página | Zero |
| Integração | 1 chamada HTTP | 1 chamada HTTP | SDK/credenciais de nuvem e treinamento | Local |

**Decisão:** arquitetura modular com **Claude como padrão recomendado** (melhor relação precisão × simplicidade para documentos brasileiros heterogêneos, especialmente ANTT, que varia muito de layout), **OpenAI** como alternativa equivalente, e **OCR local** para quem não pode enviar dados a terceiros. Novos provedores (Document AI, Textract, Azure) podem ser adicionados implementando `ExtractionProvider` em `src/server/ai/providers/` e registrando-os em `registry.ts`.

### Anthropic (Messages API)

- Endpoint: `POST https://api.anthropic.com/v1/messages`, cabeçalhos `x-api-key` e `anthropic-version: 2023-06-01`.
- Conteúdo: PDFs como bloco `document` (base64); imagens como `image` (convertidas para JPEG ≤ 2000 px; HEIC suportado).
- Saída: ferramenta `registrar_extracao` com `input_schema` = JSON Schema do documento e `tool_choice` forçado.
- Variáveis: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_TIMEOUT_MS`.
- Novas tentativas automáticas em 408/429/5xx/529 com espera exponencial; 401/403 viram erro claro de credencial.

### OpenAI (Chat Completions)

- Endpoint: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`.
- PDFs como item `file` (data URL); imagens como `image_url` com `detail: high`.
- `response_format: { type: "json_schema", strict: true }`.
- Variáveis: `OPENAI_API_KEY`, `OPENAI_MODEL`.

### OCR local

- `tesseract.js` com modelo de português do pacote `@tesseract.js-data/por` (sem download em tempo de execução); `OCR_LANG_PATH` permite outro diretório.
- PDFs com camada de texto são lidos diretamente (unpdf); PDFs digitalizados são rasterizados com `pdftoppm` (poppler-utils) quando disponível.
- Regras por documento em `src/server/ai/providers/local-parsers.ts`. Confiança máxima limitada (todos os campos ficam "Conferir").

### Schemas de extração

Definidos em `src/lib/extraction-schemas.ts`:

| Documento | Campos |
|---|---|
| `cnh` | nome, cpf, rg, data_nascimento, naturalidade, numero_cnh, registro, data_emissao, data_validade, categoria, primeira_habilitacao, uf_emissao, observacoes |
| `comprovante_residencia` | titular_nome, titular_cpf, logradouro, numero, complemento, bairro, cidade, uf, cep, data_emissao |
| `dados_bancarios` | banco_nome, banco_codigo, agencia, conta, conta_digito, tipo_conta, titular_nome, titular_documento, pix_tipo, pix_chave |
| `crlv` | placa, renavam, numero_crv, marca, modelo, ano_fabricacao, ano_modelo, chassi, cor, combustivel, categoria, especie_tipo, carroceria, capacidade, pbt, eixos, proprietario_nome, proprietario_documento, municipio, uf, exercicio, data_emissao |
| `antt` | rntrc, transportador_nome, transportador_documento, categoria, tipo_transportador (TAC/ETC/CTC), situacao, data_emissao, data_validade, placa |
| `foto_veiculo` | tipo_veiculo, tipo_rodado, carroceria, cor, eixos, placa_visivel, caracteristicas (sugestões visuais) |

Formato devolvido por todos os provedores (exemplo):

```json
{
  "document_type_detected": "cnh",
  "matches_expected": true,
  "legibility": "boa",
  "fields": {
    "nome": { "value": "NOME DE EXEMPLO", "confidence": 0.97 },
    "cpf": { "value": "00000000000", "confidence": 0.95 },
    "rg": { "value": null, "confidence": 0 }
  },
  "warnings": ["verso não enviado"]
}
```

Após o pós-processamento, cada campo ganha `status` (`high` | `review` | `missing` | `conflict`), `raw` (valor original) e `notes`.

## Supabase

- **Banco:** conexão PostgreSQL direta (`DATABASE_URL`, `DATABASE_SSL=true`). RLS habilitado sem políticas e privilégios de `anon`/`authenticated` revogados pela migration `0001`.
- **Storage:** `@supabase/supabase-js` com `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor; bucket privado (criado automaticamente se não existir; bucket público é recusado).

## API HTTP interna

Todas as rotas exigem sessão (cookie `af_session`). Rotas de escrita verificam a origem (`Origin`) e a permissão do perfil.

| Método e rota | Permissão | Descrição |
|---|---|---|
| `POST /api/records/{driver\|vehicle}/{id}/documents` | `documents.upload` | Upload multipart (`file`, `docType`, `replaceId?`). Retorna o documento com URL assinada. |
| `POST /api/records/{kind}/{id}/process` | `ai.process` | Corpo `{ "docTypes"?: [...] }`. Resposta `application/x-ndjson` com eventos `start`, `stage`, `result`, `doc_error`, `organizing`, `error`, `done`. |
| `POST /api/records/{kind}/{id}/pdf` | `pdf.generate` | Gera/regenera o PDF a partir dos dados salvos. Retorna URLs assinadas, versão e páginas. |
| `GET /api/files/doc/{id}?exp&sig[&download=1]` | `documents.read` | Documento original (HEIC é convertido para visualização). |
| `GET /api/files/ficha/{kind}/{id}?exp&sig[&version][&download=1]` | `pdf.download` | PDF atual ou de uma versão anterior. |
| `GET /api/files/logo?exp&sig` | sessão | Logotipo configurado. |
| `GET /api/export/{kind}?q&status&sort[&full=1]` | `export.basic` (`export.full` para dados completos) | CSV (`;`, UTF‑8 com BOM) compatível com Excel; proteção contra injeção de fórmulas. |
| `GET /api/health` | pública | Verificação de saúde (sem dados). |

URLs assinadas: HMAC‑SHA256 (`APP_SECRET`) sobre `recurso | usuário | expiração`, válidas por 10 minutos e somente para o usuário que as recebeu.

### Server Actions (`src/app/actions`)

- `auth.ts`: login (com limite de tentativas), logout, troca de senha.
- `records.ts`: criar/salvar/descartar rascunho, checar duplicidade, finalizar, editar (gera versão e regenera PDF), remover documento, lixeira/restaurar/excluir definitivamente, revelar dados sensíveis (auditado).
- `admin.ts`: configurações da empresa e da ficha, logotipo, autorização de IA externa, retenção, usuários.
