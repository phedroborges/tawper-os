import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tawper OS — Sistema operacional comercial",
  description: "Demonstração do Tawper OS: carteira, funis, conversas, IA assistiva e gestão comercial da Tawper Mangueiras e Conexões.",
};

export const viewport: Viewport = {
  themeColor: "#06163b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
