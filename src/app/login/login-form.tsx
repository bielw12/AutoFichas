"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="voce@transportadora.com.br" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          <AlertCircle className="size-4 shrink-0" /> {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Entrar
      </Button>
    </form>
  );
}
