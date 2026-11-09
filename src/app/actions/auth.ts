"use server";

import { redirect } from "next/navigation";
import { audit } from "@/server/audit";
import { clientIp, createSession, destroySession, getCurrentUser, requireUser } from "@/server/auth/session";
import { authDisabled } from "@/server/env";
import { runAction } from "@/server/http";
import { authenticate, changeOwnPassword, isLoginBlocked, recordLoginAttempt } from "@/server/services/users";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (authDisabled()) redirect("/");
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const next = String(form.get("next") ?? "/");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const ip = (await clientIp()) ?? "desconhecido";
  const keys = [`email:${email}`, `ip:${ip}`];
  if (await isLoginBlocked(keys)) {
    return { error: "Muitas tentativas sem sucesso. Aguarde 15 minutos e tente novamente." };
  }
  const user = await authenticate(email, password);
  await recordLoginAttempt(keys, !!user);
  if (!user) {
    await audit({ user: null, action: "auth.login_failed", entityType: "auth", details: { motivo: "credenciais" }, ip });
    return { error: "E-mail ou senha incorretos." };
  }
  await createSession(user.id);
  await audit({ user, action: "auth.login", entityType: "auth", entityId: user.id, ip });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  if (authDisabled()) redirect("/");
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ user, action: "auth.logout", entityType: "auth", entityId: user.id });
  redirect("/login");
}

export async function changePasswordAction(current: string, next: string) {
  return runAction(async () => {
    const user = await requireUser();
    await changeOwnPassword(user, current, next);
  });
}
