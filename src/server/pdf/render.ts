import "server-only";
import type { Browser } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = (async () => {
    const { chromium } = await import("playwright-core");
    return chromium.launch({
      executablePath: process.env.PDF_CHROMIUM_EXECUTABLE || undefined,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--font-render-hinting=none"],
    });
  })();
  return browserPromise;
}

/**
 * Renderiza HTML estático em PDF A4 no servidor. JavaScript e acesso à rede
 * ficam desabilitados na página (o conteúdo contém dados de usuários).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) => {
      const url = route.request().url();
      return url.startsWith("data:") || url === "about:blank" ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Inicia o Chromium antecipadamente (o primeiro PDF não espera a inicialização). */
export async function warmUpBrowser() {
  await getBrowser();
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  browserPromise = null;
  await b?.close();
}
