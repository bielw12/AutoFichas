import Link from "next/link";
import { ChevronLeft, ChevronRight, FileClock, Plus, SearchX, Truck, UserRound } from "lucide-react";
import { EmptyState, ExpiryBadge, Mono, PageHeader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { KIND_LABELS, type RecordKind } from "@/lib/doc-types";
import { formatDateBR, formatDateTimeBR, formatPlaca, maskCPF } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/session";
import { listRecords, type SortKey } from "@/server/services/records";
import { signedFichaUrl } from "@/server/signed-url";
import { ListToolbar } from "./list-toolbar";
import { RowActions } from "./row-actions";

export interface ListSearchParams {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
}

export async function RecordsList({ kind, user, sp }: { kind: RecordKind; user: SessionUser; sp: ListSearchParams }) {
  const labels = KIND_LABELS[kind];
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listRecords(kind, { q: sp.q, status: sp.status, sort: sp.sort as SortKey, page, pageSize: 20 });
  const drafts = await listRecords(kind, { drafts: true, pageSize: 5 });
  const myDrafts = drafts.items.filter((d) => d.row.createdBy === user.id || user.role === "admin");
  const canCreate = can(user.role, "records.create");
  const canEdit = can(user.role, "records.edit");
  const canDelete = can(user.role, "records.delete");
  const filtered = !!(sp.q || sp.status);

  const link = (p: number) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (sp.status) qs.set("status", sp.status);
    if (sp.sort) qs.set("sort", sp.sort);
    if (p > 1) qs.set("page", String(p));
    return `/${labels.slug}?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Gerenciamento"
        title={`Fichas de ${labels.plural.toLowerCase()}`}
        description={`${data.total} ${data.total === 1 ? "cadastro encontrado" : "cadastros encontrados"}${filtered ? " com os filtros aplicados" : ""}.`}
        actions={
          canCreate && (
            <Button asChild>
              <Link href={`/nova-ficha/${kind === "driver" ? "motorista" : "veiculo"}`}>
                <Plus /> Nova ficha de {labels.singular.toLowerCase()}
              </Link>
            </Button>
          )
        }
      />

      {myDrafts.length > 0 && canCreate && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <FileClock className="size-4" /> Cadastros em andamento
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {myDrafts.map((d) => (
              <li key={d.row.id}>
                <Link href={`/nova-ficha/${kind === "driver" ? "motorista" : "veiculo"}?id=${d.row.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                  {kind === "driver" ? d.values.nome || "Sem nome" : d.values.placa ? formatPlaca(d.values.placa) : "Sem placa"} · {formatDateTimeBR(d.row.updatedAt)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="overflow-hidden">
        <ListToolbar
          placeholder={kind === "driver" ? "Pesquisar por nome, CPF, CNH, telefone ou cidade" : "Pesquisar por placa, modelo, Renavam, chassi ou proprietário"}
          exportHref={`/api/export/${kind}`}
          canExportFull={can(user.role, "export.full")}
        />
        {data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="Nenhum resultado" description="Ajuste a pesquisa ou os filtros de situação." />
          ) : (
            <EmptyState
              icon={kind === "driver" ? UserRound : Truck}
              title={`Nenhuma ficha de ${labels.singular.toLowerCase()} ainda`}
              description="As fichas salvas aparecerão aqui, com busca, filtros e alertas de vencimento."
              action={
                canCreate && (
                  <Button asChild>
                    <Link href={`/nova-ficha/${kind === "driver" ? "motorista" : "veiculo"}`}>
                      <Plus /> Criar a primeira
                    </Link>
                  </Button>
                )
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                  {kind === "driver" ? (
                    <>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">CPF</th>
                      <th className="px-4 py-3">CNH</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Validade</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3">Veículo</th>
                      <th className="px-4 py-3">Placa</th>
                      <th className="px-4 py-3">Renavam</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Rodado</th>
                    </>
                  )}
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Atualizado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map(({ row, values: v, status, expiries }) => {
                  const href = `/${labels.slug}/${row.id}`;
                  const title = kind === "driver" ? v.nome || "Sem nome" : [v.marca, v.modelo].filter(Boolean).join(" ") || "Sem modelo";
                  const exp = expiries.find((e) => e.state !== "ok");
                  return (
                    <tr key={row.id} className="group hover:bg-brand-50/40">
                      {kind === "driver" ? (
                        <>
                          <td className="max-w-64 px-4 py-3">
                            <Link href={href} className="block truncate font-semibold text-ink hover:text-brand-600">
                              {title}
                            </Link>
                            {v.cidade && <span className="text-xs text-muted">{[v.cidade, v.uf].filter(Boolean).join(" / ")}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Mono>{maskCPF(v.cpf) || "—"}</Mono>
                          </td>
                          <td className="px-4 py-3">
                            <Mono>{v.cnhNumero || v.cnhRegistro || "—"}</Mono>
                          </td>
                          <td className="px-4 py-3 font-semibold">{v.cnhCategoria || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="tabular">{formatDateBR(v.cnhValidade) || "—"}</div>
                            {exp && <ExpiryBadge e={exp} />}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="max-w-64 px-4 py-3">
                            <Link href={href} className="block truncate font-semibold text-ink hover:text-brand-600">
                              {title}
                            </Link>
                            {(v.anoFabricacao || v.anoModelo) && <span className="text-xs text-muted">{[v.anoFabricacao, v.anoModelo].filter(Boolean).join("/")}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-md border border-ink/15 bg-white px-1.5 py-0.5 font-mono text-[12.5px] font-bold tracking-wider">{formatPlaca(v.placa) || "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Mono>{v.renavam || "—"}</Mono>
                          </td>
                          <td className="px-4 py-3">{v.tipoVeiculo || "—"}</td>
                          <td className="px-4 py-3">
                            {v.tipoRodado || "—"}
                            {exp && (
                              <div>
                                <ExpiryBadge e={exp} />
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted tabular">{formatDateTimeBR(row.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActions
                          kind={kind}
                          id={row.id}
                          title={title}
                          pdfUrl={row.pdfStorageKey ? signedFichaUrl(kind, row.id, user.id, { download: true }) : null}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">
              Página {data.page} de {data.pages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" asChild disabled={page <= 1}>
                <Link href={link(page - 1)} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                  <ChevronLeft /> Anterior
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={link(page + 1)} aria-disabled={page >= data.pages} className={page >= data.pages ? "pointer-events-none opacity-50" : ""}>
                  Próxima <ChevronRight />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
