/**
 * Executado uma vez quando o servidor Next inicia (ver instrumentation-node.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
