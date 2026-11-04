"use client";

import { Check, CircleAlert, CircleCheck, CircleDashed, FileSearch, PencilLine, TriangleAlert } from "lucide-react";
import { Tooltip } from "@/components/ui/overlays";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";
import { DOC_TYPES, type RecordKind } from "@/lib/doc-types";
import { STATUS_STYLE, type FieldMeta, type FieldMetaMap, type FieldStatus } from "@/lib/field-meta";
import { FIELDS, SECTIONS, type FormValues, type RecordFieldDef } from "@/lib/fields";
import { maskTyping } from "@/lib/form-display";
import { cn } from "@/lib/utils";

const RING: Record<FieldStatus, string> = {
  high: "border-l-emerald-500",
  confirmed: "border-l-emerald-500",
  review: "border-l-sun-400",
  missing: "border-l-red-500",
  conflict: "border-l-red-500",
  manual: "border-l-brand-400",
};

const ICON: Record<FieldStatus, React.ComponentType<{ className?: string }>> = {
  high: CircleCheck,
  confirmed: CircleCheck,
  review: TriangleAlert,
  missing: CircleDashed,
  conflict: CircleAlert,
  manual: PencilLine,
};

const ICON_COLOR: Record<FieldStatus, string> = {
  high: "text-emerald-600",
  confirmed: "text-emerald-600",
  review: "text-sun-500",
  missing: "text-red-500",
  conflict: "text-red-600",
  manual: "text-brand-500",
};

function MetaChip({ meta, onShowSource }: { meta: FieldMeta; onShowSource?: () => void }) {
  const style = STATUS_STYLE[meta.status];
  const Icon = ICON[meta.status];
  const src = meta.source ? DOC_TYPES[meta.source.docType]?.shortLabel : null;
  const tip = (
    <div className="space-y-1">
      <div className="font-bold">{style.label}</div>
      {src && (
        <div>
          Origem: {src}
          {typeof meta.confidence === "number" && meta.status !== "missing" ? ` · confiança ${Math.round(meta.confidence * 100)}%` : ""}
        </div>
      )}
      {meta.status === "manual" && meta.suggested ? <div>Sugestão da IA: {meta.suggested}</div> : null}
      {meta.notes?.map((n) => (
        <div key={n} className="text-brand-200">
          {n}
        </div>
      ))}
      {meta.source && meta.status !== "manual" && <div className="text-brand-300">Sugestão lida do documento — não é validação oficial.</div>}
    </div>
  );
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        onClick={onShowSource}
        className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold hover:bg-canvas", ICON_COLOR[meta.status])}
        aria-label={`${style.label}${src ? `, origem ${src}` : ""}. Ver documento.`}
      >
        <Icon className="size-3.5" />
        <span className="hidden sm:inline">{src && meta.status !== "manual" ? src : style.label}</span>
        {src && <FileSearch className="size-3 opacity-60" />}
      </button>
    </Tooltip>
  );
}

export function FieldControl({
  def,
  value,
  onChange,
  onFocus,
  error,
  readOnly,
  id,
}: {
  def: RecordFieldDef;
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  error?: string;
  readOnly?: boolean;
  id: string;
}) {
  const common = {
    id,
    name: def.key,
    onFocus,
    disabled: readOnly,
    "aria-invalid": !!error || undefined,
    "aria-describedby": error ? `${id}-err` : undefined,
    className: cn(error && "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-100"),
  };
  if (def.input === "textarea") return <Textarea {...common} value={value} rows={4} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (def.input === "select" || def.input === "uf") {
    return (
      <NativeSelect {...common} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {def.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {value && !def.options?.some((o) => o.value === value) && <option value={value}>{value} (fora da lista)</option>}
      </NativeSelect>
    );
  }
  if (def.input === "date") return <Input {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} min="1900-01-01" max="2100-12-31" />;
  const listId = def.input === "combo" ? `${id}-list` : undefined;
  const numeric = ["cpf", "cep", "phone", "digits", "renavam", "cnh_registro", "year", "number"].includes(def.input);
  return (
    <>
      <Input
        {...common}
        value={value}
        list={listId}
        inputMode={numeric ? (def.input === "number" ? "decimal" : "numeric") : def.input === "email" ? "email" : undefined}
        type={def.input === "email" ? "email" : "text"}
        placeholder={def.placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cn(common.className, ["cpf", "cpf_cnpj", "placa", "renavam", "chassi", "cnh_registro", "digits"].includes(def.input) && "font-mono text-[13px] tracking-tight")}
        onChange={(e) => onChange(maskTyping(def.input, e.target.value))}
      />
      {listId && (
        <datalist id={listId}>
          {def.suggestions?.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

export interface RecordFormProps {
  kind: RecordKind;
  values: FormValues;
  meta: FieldMetaMap;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onConfirm?: (key: string) => void;
  onFocusField?: (key: string) => void;
  highlight?: string[];
  readOnly?: boolean;
  sections?: string[];
}

/** Formulário inteligente organizado por seções, com indicação de confiança. */
export function RecordForm({ kind, values, meta, errors = {}, onChange, onConfirm, onFocusField, highlight = [], readOnly, sections }: RecordFormProps) {
  const fields = FIELDS[kind];
  return (
    <div className="space-y-5">
      {SECTIONS[kind]
        .filter((s) => !sections || sections.includes(s.id))
        .map((section) => {
          const list = fields.filter((f) => f.section === section.id);
          const counts = list.reduce(
            (acc, f) => {
              const st = meta[f.key]?.status;
              if (st === "review") acc.review++;
              else if (st === "missing" || st === "conflict") acc.red++;
              return acc;
            },
            { review: 0, red: 0 },
          );
          return (
            <section key={section.id} id={`secao-${section.id}`} className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
                <span className="h-4 w-1 rounded-full bg-sun-400" />
                <h3 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-brand-800">{section.title}</h3>
                <div className="ml-auto flex gap-1.5">
                  {counts.review > 0 && <span className="rounded-full bg-sun-50 px-2 py-0.5 text-[11px] font-bold text-sun-600 ring-1 ring-sun-200">{counts.review} a conferir</span>}
                  {counts.red > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">{counts.red} pendente{counts.red > 1 ? "s" : ""}</span>}
                </div>
                {section.description && <p className="w-full text-xs text-muted">{section.description}</p>}
              </header>
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-5 sm:grid-cols-2 2xl:grid-cols-3">
                {list.map((def) => {
                  const m = meta[def.key];
                  const id = `f-${def.key}`;
                  const err = errors[def.key];
                  const canConfirm = !readOnly && m && (m.status === "review" || m.status === "conflict") && !!values[def.key];
                  return (
                    <div
                      key={def.key}
                      className={cn(
                        "min-w-0 rounded-lg border-l-[3px] pl-3",
                        m ? RING[m.status] : "border-l-transparent",
                        def.wide || def.input === "textarea" ? "sm:col-span-2" : "",
                        def.input === "textarea" && "2xl:col-span-3",
                        highlight.includes(def.key) && "bg-red-50/60 ring-1 ring-red-200 rounded-r-lg py-1",
                      )}
                    >
                      <div className="mb-1.5 flex min-h-6 items-start justify-between gap-2">
                        <Label htmlFor={id} className="pt-0.5 leading-snug">
                          {def.label}
                          {def.required && <span className="ml-0.5 text-red-500">*</span>}
                        </Label>
                        <div className="flex shrink-0 items-center">
                          {m && <MetaChip meta={m} onShowSource={() => onFocusField?.(def.key)} />}
                          {canConfirm && onConfirm && (
                            <Tooltip content="Marcar como conferido">
                              <button type="button" onClick={() => onConfirm(def.key)} className="rounded-md p-0.5 text-muted hover:bg-emerald-50 hover:text-emerald-700" aria-label={`Confirmar ${def.label}`}>
                                <Check className="size-4" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <FieldControl def={def} id={id} value={values[def.key] ?? ""} error={err} readOnly={readOnly} onChange={(v) => onChange(def.key, v)} onFocus={() => onFocusField?.(def.key)} />
                      {err ? (
                        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-red-600">
                          {err}
                        </p>
                      ) : def.help ? (
                        <p className="mt-1 text-xs text-muted">{def.help}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}

export function ConfidenceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-emerald-500" /> Alta confiança
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-sun-400" /> Conferir
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-red-500" /> Não identificado / inconsistente
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-brand-400" /> Editado por você
      </span>
    </div>
  );
}
