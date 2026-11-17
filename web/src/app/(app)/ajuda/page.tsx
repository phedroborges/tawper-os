import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/HelpCenter";
import { HELP_CONTENT } from "@/content/help-center.generated";

export const metadata: Metadata = {
  title: "Ajuda · Tawper",
  description: "Orientações para usar clientes, atividades, funis, propostas, rotas e IA no Tawper.",
};

export default function AjudaPage() {
  return (
    <HelpCenter>
      {/* Conteúdo editorial gerado localmente, com todos os textos escapados. */}
      <div dangerouslySetInnerHTML={{ __html: HELP_CONTENT }} />
    </HelpCenter>
  );
}
