import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "AutoFichas", template: "%s · AutoFichas" },
  description: "Gestão e geração inteligente de fichas cadastrais de motoristas e veículos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#10253f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
