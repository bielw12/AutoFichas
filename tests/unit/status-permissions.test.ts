import { describe, expect, it } from "vitest";
import { can, type Permission } from "@/lib/permissions";
import { computeBaseStatus, effectiveStatus, expiryInfo } from "@/lib/status";

const fullDriver = {
  nome: "FULANO",
  cpf: "12345678909",
  cnhNumero: "1",
  cnhRegistro: "12345678900",
  cnhCategoria: "E",
  cnhValidade: "2031-01-01",
  cep: "13010100",
  logradouro: "RUA",
  numero: "1",
  bairro: "B",
  cidade: "C",
  uf: "SP",
  telefonePrincipal: "11988887777",
  bancoNome: "BANCO",
  conta: "123",
  titularNome: "FULANO",
};

describe("situação dos cadastros", () => {
  it("calcula a situação base a partir dos dados existentes", () => {
    const docs = ["cnh", "comprovante_residencia", "dados_bancarios"] as const;
    expect(computeBaseStatus({ kind: "driver", values: fullDriver, presentDocs: [...docs], reviewPending: false, isDraft: false })).toBe("completo");
    expect(computeBaseStatus({ kind: "driver", values: fullDriver, presentDocs: ["cnh"], reviewPending: false, isDraft: false })).toBe("documentacao_pendente");
    expect(computeBaseStatus({ kind: "driver", values: { ...fullDriver, cpf: "" }, presentDocs: [...docs], reviewPending: false, isDraft: false })).toBe("incompleto");
    expect(computeBaseStatus({ kind: "driver", values: fullDriver, presentDocs: [...docs], reviewPending: true, isDraft: false })).toBe("aguardando_conferencia");
    expect(computeBaseStatus({ kind: "driver", values: fullDriver, presentDocs: [...docs], reviewPending: false, isDraft: true })).toBe("rascunho");
  });

  it("calcula vencimento sem presumir validade quando a data não existe", () => {
    const today = "2026-11-04";
    expect(expiryInfo("driver", { cnhValidade: "" }, 30, today)).toEqual([]);
    expect(expiryInfo("driver", { cnhValidade: "2026-11-01" }, 30, today)[0].state).toBe("vencido");
    expect(expiryInfo("driver", { cnhValidade: "2026-11-20" }, 30, today)[0]).toMatchObject({ state: "proximo", daysLeft: 16 });
    expect(expiryInfo("driver", { cnhValidade: "2027-06-01" }, 30, today)[0].state).toBe("ok");
    expect(expiryInfo("vehicle", { anttValidade: "2026-11-10" }, 30, today).map((e) => e.label)).toEqual(["ANTT/RNTRC"]);
  });

  it("documento vencido prevalece sobre as demais situações", () => {
    const venc = expiryInfo("driver", { cnhValidade: "2020-01-01" }, 30, "2026-11-04");
    expect(effectiveStatus("completo", venc)).toBe("vencido");
    expect(effectiveStatus("incompleto", venc)).toBe("vencido");
    const prox = expiryInfo("driver", { cnhValidade: "2026-11-20" }, 30, "2026-11-04");
    expect(effectiveStatus("completo", prox)).toBe("proximo_vencimento");
    expect(effectiveStatus("incompleto", prox)).toBe("incompleto");
  });
});

describe("controle de permissões", () => {
  const adminOnly: Permission[] = ["settings.manage", "users.manage", "records.delete", "records.purge", "export.full", "records.saveIncomplete", "audit.read"];

  it("administrador tem acesso integral", () => {
    for (const p of adminOnly) expect(can("admin", p)).toBe(true);
  });

  it("operador cria, edita e processa, mas não administra nem exclui", () => {
    for (const p of ["records.create", "records.edit", "ai.process", "documents.upload", "pdf.generate"] as Permission[]) expect(can("operador", p)).toBe(true);
    for (const p of adminOnly) expect(can("operador", p)).toBe(false);
  });

  it("visualizador apenas consulta e baixa", () => {
    expect(can("visualizador", "records.read")).toBe(true);
    expect(can("visualizador", "pdf.download")).toBe(true);
    for (const p of ["records.create", "records.edit", "documents.upload", "ai.process", "sensitive.reveal", ...adminOnly] as Permission[]) {
      expect(can("visualizador", p)).toBe(false);
    }
    expect(can(null, "records.read")).toBe(false);
  });
});
