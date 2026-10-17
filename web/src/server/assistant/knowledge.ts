import presentation from "./knowledge/presentation.json";
import type { AssistantSource } from "@/lib/assistant-contract";

export const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const knowledgeCoverage = presentation.coverage;
export const knowledgeIndex = presentation.slides.filter((s) => s.id !== "slide-33").map((s) => ({ id: s.id, title: s.title }));

export function readKnowledge(ids: string[]): AssistantSource[] {
  return presentation.slides.filter((s) => ids.includes(s.id) && s.id !== "slide-33").map((s) => ({
    id: `doc:${presentation.id}:${s.id}`,
    title: `${presentation.title} · slide ${Number(s.id.replace("slide-", ""))} · ${s.title}`,
    excerpt: s.text,
  }));
}

export function searchKnowledge(query: string) {
  const terms = normalizeText(query).split(" ").filter((s) => s.length > 2);
  const matches = knowledgeIndex.map((s) => {
    const doc = presentation.slides.find((x) => x.id === s.id)!;
    const title = normalizeText(doc.title);
    const text = normalizeText(doc.text);
    return { ...s, score: terms.reduce((n, term) => n + (title.includes(term) ? 4 : text.includes(term) ? 1 : 0), 0) };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  return { coverage: knowledgeCoverage, matches, index: knowledgeIndex };
}
