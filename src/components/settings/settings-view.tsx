"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Building2, Copy, HardDrive, ImageUp, KeyRound, Lock, Palette, RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { changePasswordAction } from "@/app/actions/auth";
import { createUserAction, removeLogoAction, uploadLogoAction, resetPasswordAction, runRetentionAction, setExternalAiAction, updateSettingsAction, updateUserAction, type SettingsInput } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";
import { formatDateTimeBR } from "@/lib/format";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";

type SettingsData = Required<{ [K in keyof SettingsInput]: Exclude<SettingsInput[K], undefined> }>;

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function SettingsView({
  initialTab,
  isAdmin,
  currentUserId,
  settings,
  logoUrl,
  ai,
  users,
  storage,
}: {
  initialTab: string;
  isAdmin: boolean;
  currentUserId: string;
  settings: SettingsData;
  logoUrl: string | null;
  ai: { id: string; label: string; configured: boolean; external: boolean; model: string | null; message: string; externalEnabled: boolean; externalEnabledAt: string | null };
  users: UserRow[];
  storage: { driver: string; encrypted: boolean; antivirus: boolean };
}) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        {isAdmin && (
          <TabsTrigger value="empresa">
            <Building2 /> Empresa e ficha
          </TabsTrigger>
        )}
        <TabsTrigger value="ia">
          <Bot /> Inteligência artificial
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="usuarios">
            <Users /> Usuários
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="privacidade">
            <ShieldCheck /> Privacidade e retenção
          </TabsTrigger>
        )}
        <TabsTrigger value="conta">
          <KeyRound /> Minha conta
        </TabsTrigger>
      </TabsList>
      {isAdmin && (
        <TabsContent value="empresa" className="pt-6">
          <CompanyForm settings={settings} logoUrl={logoUrl} />
        </TabsContent>
      )}
      <TabsContent value="ia" className="pt-6">
        <AiPanel ai={ai} isAdmin={isAdmin} />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="usuarios" className="pt-6">
          <UsersPanel users={users} currentUserId={currentUserId} />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="privacidade" className="pt-6">
          <PrivacyPanel settings={settings} storage={storage} />
        </TabsContent>
      )}
      <TabsContent value="conta" className="pt-6">
        <AccountPanel />
      </TabsContent>
    </Tabs>
  );
}

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function CompanyForm({ settings, logoUrl }: { settings: SettingsData; logoUrl: string | null }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => setS((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    const res = await updateSettingsAction(s);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Configurações salvas. As próximas fichas geradas usarão esta identidade.");
    router.refresh();
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await uploadLogoAction(fd);
    setUploading(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Logotipo atualizado.");
    router.refresh();
  };

  const phones = s.phones.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const emails = s.emails.split(/\n|;|,/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-brand-500" /> Dados da transportadora
            </CardTitle>
            <CardDescription>Exibidos no rodapé institucional de todas as páginas da ficha.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da transportadora">
              <Input value={s.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Ex.: Transportes Exemplo Ltda." />
            </Field>
            <Field label="CNPJ">
              <Input value={s.cnpj} onChange={(e) => set("cnpj", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Telefones" hint="Um por linha. O primeiro aparece em destaque.">
              <Textarea rows={3} value={s.phones} onChange={(e) => set("phones", e.target.value)} />
            </Field>
            <Field label="E-mails" hint="Um por linha (ex.: operacional e comercial).">
              <Textarea rows={3} value={s.emails} onChange={(e) => set("emails", e.target.value)} />
            </Field>
            <Field label="Site">
              <Input value={s.website} onChange={(e) => set("website", e.target.value)} placeholder="www.suatransportadora.com.br" />
            </Field>
            <Field label="Endereço">
              <Input value={s.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Texto adicional do rodapé" className="sm:col-span-2">
              <Input value={s.footerText} onChange={(e) => set("footerText", e.target.value)} placeholder="Ex.: Documento de uso interno" />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4 text-brand-500" /> Identidade visual da ficha
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Cor principal (faixas e títulos)">
              <div className="flex gap-2">
                <input type="color" value={s.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" aria-label="Cor principal" />
                <Input value={s.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="font-mono" />
              </div>
            </Field>
            <Field label="Cor de destaque">
              <div className="flex gap-2">
                <input type="color" value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" aria-label="Cor de destaque" />
                <Input value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="font-mono" />
              </div>
            </Field>
            <label className="flex items-start gap-3 sm:col-span-2">
              <Switch checked={s.footerOnDocuments} onCheckedChange={(v) => set("footerOnDocuments", v)} />
              <span className="text-sm">
                <span className="font-semibold">Aplicar o rodapé institucional nas páginas dos documentos anexados</span>
                <span className="block text-muted">Os documentos são reduzidos proporcionalmente para caber acima do rodapé, sem cortes. Desative para anexar as páginas de PDF exatamente como enviadas.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 sm:col-span-2">
              <Switch checked={s.includeBankPage} onCheckedChange={(v) => set("includeBankPage", v)} />
              <span className="text-sm">
                <span className="font-semibold">Incluir página &quot;Dados bancários&quot; na ficha do motorista</span>
                <span className="block text-muted">Inserida antes dos comprovantes bancários enviados.</span>
              </span>
            </label>
            <Field label="Logotipo" className="sm:col-span-2" hint="PNG com fundo transparente fica melhor sobre a faixa colorida. Máx. 1,5 MB.">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-16 w-44 items-center justify-center rounded-lg p-2" style={{ background: s.primaryColor }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoUrl ? <img src={logoUrl} alt="Logotipo atual" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-semibold text-white/80">Sem logotipo</span>}
                </div>
                <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
                  <ImageUp /> {logoUrl ? "Trocar" : "Enviar"} logotipo
                </Button>
                {logoUrl && (
                  <Button
                    variant="danger-ghost"
                    onClick={async () => {
                      const res = await removeLogoAction();
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Logotipo removido.");
                      router.refresh();
                    }}
                  >
                    <Trash2 /> Remover
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadLogo(f);
                  }}
                />
              </div>
            </Field>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button size="lg" onClick={save} loading={saving}>
            Salvar configurações
          </Button>
        </div>
      </div>

      <div>
        <div className="sticky top-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">Pré-visualização</div>
          <div className="relative aspect-[1/1.414] overflow-hidden rounded-lg border border-line bg-white shadow-[var(--shadow-pop)]">
            <svg className="absolute right-0 top-0 h-[24%] w-[26%]" viewBox="0 0 150 190" preserveAspectRatio="none" aria-hidden>
              <path d="M150 0 L150 190 C140 168 128 150 122 128 C112 92 116 64 92 42 C74 26 52 18 36 0 Z" fill={s.primaryColor} />
            </svg>
            <div className="px-[9%] pt-[11%] text-center">
              <div className="text-[19px] font-extrabold leading-tight text-black">FICHA CADASTRAL DE MOTORISTA.</div>
              <div className="mx-auto mt-2 h-1 w-10 rounded" style={{ background: s.accentColor }} />
            </div>
            <div className="space-y-1.5 px-[9%] pt-6 text-[10.5px] text-ink-soft">
              {["Nome", "CPF", "Data de nascimento", "Natural de", "", "CNH", "Registro", "Categoria"].map((l, i) =>
                l ? (
                  <div key={i} className="flex gap-1">
                    <span className={i === 0 || i === 5 ? "font-bold text-black" : ""}>{l}:</span>
                    <span className="h-2.5 flex-1 translate-y-0.5 rounded bg-line/70" />
                  </div>
                ) : (
                  <div key={i} className="h-2" />
                ),
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[13%]" style={{ background: s.primaryColor, borderTop: `2px solid ${s.accentColor}` }}>
              <div className="flex h-full items-center justify-between px-[4%] text-white">
                <div className="min-w-0 space-y-0.5 text-[7.5px] leading-tight">
                  <div className="truncate text-[8.5px] font-bold">{phones[0] ?? "Telefone"}</div>
                  <div className="truncate">{s.website || "site"}</div>
                  {(emails.length ? emails : ["e-mail"]).slice(0, 2).map((e) => (
                    <div key={e} className="truncate">
                      {e}
                    </div>
                  ))}
                </div>
                <div className="flex h-[70%] w-[38%] items-center justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="truncate text-[11px] font-extrabold uppercase" style={{ color: s.accentColor }}>{s.companyName || "Sua marca"}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiPanel({ ai, isAdmin }: { ai: { id: string; label: string; configured: boolean; external: boolean; model: string | null; message: string; externalEnabled: boolean; externalEnabledAt: string | null }; isAdmin: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const toggle = async (v: boolean) => {
    const res = await setExternalAiAction(v);
    if (!res.ok) return toast.error(res.error);
    toast.success(v ? "Envio a provedor externo autorizado." : "Envio a provedor externo desativado.");
    setConfirm(false);
    router.refresh();
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Provedor de extração</CardTitle>
          <CardDescription>Definido nas variáveis de ambiente do servidor (AI_PROVIDER e chave de API). As chaves nunca são exibidas nem enviadas ao navegador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3">
            <div>
              <div className="font-bold">{ai.label}</div>
              {ai.model && <div className="font-mono text-xs text-muted">{ai.model}</div>}
            </div>
            <Badge tone={ai.configured ? "green" : "yellow"} dot>
              {ai.configured ? "Configurado" : "Não configurado"}
            </Badge>
          </div>
          <p className="text-ink-soft">{ai.message}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong>anthropic</strong> — Claude lê PDFs digitalizados e fotos com alta precisão em documentos brasileiros (recomendado).
            </li>
            <li>
              <strong>openai</strong> — modelos multimodais da OpenAI.
            </li>
            <li>
              <strong>local</strong> — OCR Tesseract no próprio servidor; nenhum dado sai do ambiente, precisão menor e sem análise da foto.
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-brand-500" /> Envio de dados a provedor externo (LGPD)
          </CardTitle>
          <CardDescription>Documentos com dados pessoais só são enviados a provedores externos após autorização expressa de um administrador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {ai.external ? (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3">
                <div>
                  <div className="font-semibold">Permitir envio ao provedor {ai.label}</div>
                  <div className="text-xs text-muted">{ai.externalEnabled && ai.externalEnabledAt ? `Autorizado em ${formatDateTimeBR(ai.externalEnabledAt)}` : "Desativado"}</div>
                </div>
                <Switch checked={ai.externalEnabled} disabled={!isAdmin} onCheckedChange={(v) => (v ? setConfirm(true) : toggle(false))} aria-label="Permitir envio ao provedor externo" />
              </div>
              <p className="text-muted">Antes de autorizar, avalie o contrato/termos de tratamento de dados do provedor, a política de retenção de dados da API e registre a base legal no seu inventário de tratamento (ROPA).</p>
            </>
          ) : (
            <p className="text-muted">O provedor atual não envia dados para fora do servidor.</p>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Autorizar envio a provedor externo?"
        description={`Os documentos enviados para extração (CNH, comprovantes, dados bancários, CRLV, ANTT e fotos) serão transmitidos ao provedor ${ai.label} para processamento. Confirme que os requisitos de privacidade e o contrato com o provedor foram avaliados.`}
        confirmLabel="Autorizar"
        onConfirm={() => toggle(true)}
      />
    </div>
  );
}

function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "operador" as Role });
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const create = async () => {
    setCreating(true);
    const res = await createUserAction(form);
    setCreating(false);
    if (!res.ok) return toast.error(res.error);
    setOpen(false);
    setSecret({ email: form.email, password: res.data.temporaryPassword });
    setForm({ name: "", email: "", role: "operador" });
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Usuários e perfis de acesso</CardTitle>
          <CardDescription>{Object.values(ROLE_LABELS).map((r) => `${r.label}: ${r.description}`).join(" ")}</CardDescription>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus /> Novo usuário
        </Button>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-y border-line bg-canvas/60 text-left text-xs font-bold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2.5">Nome</th>
              <th className="px-5 py-2.5">Perfil</th>
              <th className="px-5 py-2.5">Último acesso</th>
              <th className="px-5 py-2.5">Ativo</th>
              <th className="px-5 py-2.5 text-right">Senha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3">
                  <div className="font-semibold">
                    {u.name} {u.id === currentUserId && <Badge tone="blue">Você</Badge>}
                  </div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td className="px-5 py-3">
                  <NativeSelect
                    className="h-9 w-44"
                    value={u.role}
                    disabled={u.id === currentUserId}
                    onChange={async (e) => {
                      const res = await updateUserAction(u.id, { role: e.target.value as Role });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Perfil atualizado.");
                      router.refresh();
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r].label}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-5 py-3 text-muted">{u.lastLoginAt ? formatDateTimeBR(u.lastLoginAt) : "Nunca"}</td>
                <td className="px-5 py-3">
                  <Switch
                    checked={u.active}
                    disabled={u.id === currentUserId}
                    onCheckedChange={async (v) => {
                      const res = await updateUserAction(u.id, { active: v });
                      if (!res.ok) return toast.error(res.error);
                      toast.success(v ? "Usuário reativado." : "Usuário desativado e sessões encerradas.");
                      router.refresh();
                    }}
                    aria-label={`Ativo: ${u.name}`}
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={u.id === currentUserId}
                    onClick={async () => {
                      const res = await resetPasswordAction(u.id);
                      if (!res.ok) return toast.error(res.error);
                      setSecret({ email: u.email, password: res.data.temporaryPassword });
                    }}
                  >
                    <RefreshCw /> Redefinir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Uma senha temporária será gerada. O usuário deverá trocá-la no primeiro acesso.</DialogDescription>
          <div className="mt-4 space-y-3">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Perfil">
              <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r].label} — {ROLE_LABELS[r].description}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={creating}>
              Criar usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogTitle>Senha temporária</DialogTitle>
          <DialogDescription>Entregue esta senha ao usuário por um canal seguro. Ela não será exibida novamente.</DialogDescription>
          <div className="mt-4 rounded-lg bg-canvas p-4">
            <div className="text-xs text-muted">{secret?.email}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="font-mono text-lg font-bold">{secret?.password}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret?.password ?? "");
                  toast.success("Copiado.");
                }}
              >
                <Copy /> Copiar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PrivacyPanel({ settings, storage }: { settings: SettingsData; storage: { driver: string; encrypted: boolean; antivirus: boolean } }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Política de retenção</CardTitle>
          <CardDescription>Prazos aplicados pela rotina de manutenção (agendável via `npm run maintenance`).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Alerta de vencimento (dias)">
            <Input type="number" min={1} max={365} value={s.expiryWarningDays} onChange={(e) => setS({ ...s, expiryWarningDays: Number(e.target.value) })} />
          </Field>
          <Field label="Rascunhos inativos (dias)">
            <Input type="number" min={1} value={s.draftRetentionDays} onChange={(e) => setS({ ...s, draftRetentionDays: Number(e.target.value) })} />
          </Field>
          <Field label="Lixeira (dias)">
            <Input type="number" min={1} value={s.trashRetentionDays} onChange={(e) => setS({ ...s, trashRetentionDays: Number(e.target.value) })} />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button
              loading={saving}
              onClick={async () => {
                setSaving(true);
                const res = await updateSettingsAction(s);
                setSaving(false);
                if (!res.ok) return toast.error(res.error);
                toast.success("Política salva.");
                router.refresh();
              }}
            >
              Salvar
            </Button>
            <Button
              variant="secondary"
              loading={running}
              onClick={async () => {
                setRunning(true);
                const res = await runRetentionAction();
                setRunning(false);
                if (!res.ok) return toast.error(res.error);
                toast.success(`Limpeza concluída: ${res.data.rascunhos} rascunho(s), ${res.data.lixeira} item(ns) da lixeira e ${res.data.documentosSubstituidos} documento(s) substituído(s) removidos.`);
              }}
            >
              Executar limpeza agora
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4 text-brand-500" /> Proteção dos arquivos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <Row ok label={`Armazenamento privado (${storage.driver === "supabase" ? "Supabase Storage, bucket privado" : "disco do servidor, fora da área pública"})`} />
          <Row ok={storage.encrypted} label={storage.encrypted ? "Criptografia AES-256-GCM dos arquivos ativa" : "Criptografia de arquivos desativada — defina STORAGE_ENCRYPTION_KEY"} />
          <Row ok label="URLs temporárias assinadas (10 min) + sessão obrigatória para visualizar documentos" />
          <Row ok label="Validação do conteúdo real dos arquivos e bloqueio de PDFs com scripts/anexos" />
          <Row ok={storage.antivirus} label={storage.antivirus ? "Antivírus ClamAV ativo nos uploads" : "Antivírus opcional não configurado (CLAMAV_HOST)"} />
          <Row ok label="Logs de auditoria sem CPF, chaves PIX ou dados bancários" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-sun-400"}`} />
      <span className={ok ? "text-ink-soft" : "text-ink"}>{label}</span>
    </div>
  );
}

function AccountPanel() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Alterar senha</CardTitle>
        <CardDescription>Mínimo de 10 caracteres, com letras e números.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Senha atual">
          <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="Nova senha">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirmar nova senha">
          <Input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
        </Field>
        <Button
          loading={saving}
          disabled={!cur || !next}
          onClick={async () => {
            if (next !== conf) return toast.error("A confirmação não confere.");
            setSaving(true);
            const res = await changePasswordAction(cur, next);
            setSaving(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Senha alterada.");
            setCur("");
            setNext("");
            setConf("");
            window.location.reload();
          }}
        >
          Alterar senha
        </Button>
      </CardContent>
    </Card>
  );
}
