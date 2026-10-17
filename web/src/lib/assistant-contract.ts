export type AssistantSource = {
  id: string;
  title: string;
  excerpt: string;
  href?: string;
};

export type AssistantReply = {
  text: string;
  status: "answered" | "clarification" | "missing_data";
  sources: AssistantSource[];
  model: string;
  mode: "authenticated" | "local_preview";
};

export type AssistantMessage = { role: "user" | "assistant"; content: string };

export const ASSISTANT_STARTERS = [
  "Quais soluções a Tawper oferece?",
  "Quais são os diferenciais da Tawper?",
  "Como funciona o HydraSense?",
  "Como foi a última visita a este cliente?",
  "Qual é a maior mangueira da Tawper?",
];
