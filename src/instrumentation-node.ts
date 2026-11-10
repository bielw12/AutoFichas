/**
 * Inicialização no runtime Node.
 * Com o banco embutido (sem DATABASE_URL) ou AUTO_MIGRATE=true, aplica as
 * migrations automaticamente para que `npm run dev` funcione sem passos extras.
 */
import { getDb } from "./server/db";
import { embeddedDbDir, runMigrations, usingEmbeddedDb } from "./server/db/client";

if (usingEmbeddedDb() || process.env.AUTO_MIGRATE === "true") {
  await runMigrations(getDb());
  if (usingEmbeddedDb()) console.log(`[AutoFichas] Banco embutido pronto em ${embeddedDbDir()}`);
}
if (process.env.AUTH_DISABLED === "true") {
  console.warn("[AutoFichas] Login DESATIVADO (AUTH_DISABLED=true). Use apenas em ambiente local de testes.");
}

// Pré-aquecimento em segundo plano: não atrasa a inicialização e falhas são ignoradas.
if (process.env.NODE_ENV !== "test" && process.env.WARMUP !== "false") {
  setTimeout(async () => {
    try {
      const { warmUpBrowser } = await import("./server/pdf/render");
      await warmUpBrowser();
    } catch (err) {
      console.warn("[AutoFichas] Chromium indisponível para gerar PDFs:", (err as Error).message.split("\n")[0]);
      console.warn("[AutoFichas] Execute: npx playwright install chromium");
    }
    if ((process.env.AI_PROVIDER ?? "").toLowerCase() === "local") {
      try {
        const { warmUpOcr } = await import("./server/ai/providers/local-ocr");
        await warmUpOcr();
      } catch {}
    }
  }, 1500);
}
