import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileCheck2, ScanText, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/logo-mark";
import { getCurrentUser } from "@/server/auth/session";
import { authDisabled } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (authDisabled() || (await getCurrentUser())) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col">
        <svg className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-90" viewBox="0 0 200 200" aria-hidden>
          <path d="M200 0v200c-14-30-30-52-38-80-13-48-8-86-40-115C99-16 70-27 50 0Z" fill="#2d63a6" />
        </svg>
        <div className="absolute bottom-0 left-0 h-2 w-full bg-sun-400" />
        <Wordmark inverted />
        <div className="relative mt-auto max-w-md">
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
            Fichas cadastrais prontas em <span className="text-sun-300">minutos</span>, não em horas.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-200">
            Envie CNH, CRLV, ANTT e comprovantes. A IA lê os documentos, você confere e o sistema gera a ficha em PDF com os documentos anexados.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100">
            <li className="flex items-center gap-3">
              <ScanText className="size-5 text-sun-300" /> Extração automática com indicação de confiança
            </li>
            <li className="flex items-center gap-3">
              <FileCheck2 className="size-5 text-sun-300" /> PDF padronizado com a identidade da sua transportadora
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-sun-300" /> Documentos privados, acesso por perfil e trilha de auditoria
            </li>
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-brand-300">Dados tratados conforme a LGPD. Acesso restrito a usuários autorizados.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <h2 className="mt-8 text-2xl font-extrabold tracking-tight lg:mt-0">Entrar</h2>
          <p className="mt-1 text-sm text-muted">Use o e-mail e a senha fornecidos pelo administrador.</p>
          <LoginForm next={next ?? "/"} />
        </div>
      </section>
    </main>
  );
}
