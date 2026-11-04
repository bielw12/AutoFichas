import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={FileQuestion}
        title="Página não encontrada"
        description="O cadastro pode ter sido excluído ou o endereço está incorreto."
        action={
          <Button asChild>
            <Link href="/">Voltar ao início</Link>
          </Button>
        }
      />
    </main>
  );
}
