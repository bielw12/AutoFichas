import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Truck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/common";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Nova ficha" };

const OPTIONS = [
  {
    href: "/nova-ficha/motorista",
    icon: UserRound,
    title: "Cadastrar motorista",
    description: "Envie CNH, comprovante de residência e dados bancários.",
    docs: ["CNH", "Comprovante de residência", "Dados bancários"],
  },
  {
    href: "/nova-ficha/veiculo",
    icon: Truck,
    title: "Cadastrar veículo",
    description: "Envie CRLV, documentação ANTT/RNTRC e uma foto do veículo.",
    docs: ["CRLV", "ANTT / RNTRC", "Foto do veículo"],
  },
];

export default async function NovaFichaPage() {
  await requirePageUser("records.create");
  return (
    <>
      <PageHeader eyebrow="Nova ficha cadastral" title="O que você vai cadastrar?" description="A IA lê os documentos enviados e preenche a ficha. Você confere, corrige se necessário e gera o PDF." />
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[var(--shadow-pop)] sm:p-8"
          >
            <svg className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 text-brand-50 transition-colors group-hover:text-brand-100" viewBox="0 0 100 100" aria-hidden>
              <path d="M100 0v100C90 85 80 74 76 60 69 36 72 18 56 4 50-1 42-2 35 0Z" fill="currentColor" />
            </svg>
            <span className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
              <o.icon className="size-7" />
            </span>
            <h2 className="relative mt-5 text-xl font-extrabold tracking-tight">{o.title}</h2>
            <p className="relative mt-1 text-sm text-muted">{o.description}</p>
            <ul className="relative mt-5 flex flex-wrap gap-2">
              {o.docs.map((d) => (
                <li key={d} className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-line">
                  <FileText className="size-3.5 text-brand-500" /> {d}
                </li>
              ))}
            </ul>
            <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600">
              Começar <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-sun-400 transition-transform group-hover:scale-x-100" />
          </Link>
        ))}
      </div>
    </>
  );
}
