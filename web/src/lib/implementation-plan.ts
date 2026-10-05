import { readFile } from "node:fs/promises";
import path from "node:path";

export type PlanStatus = "NÃO INICIADA" | "PRONTA PARA INICIAR" | "EM ANDAMENTO" | "BLOQUEADA" | "EM VALIDAÇÃO" | "CONCLUÍDA";

export interface PlanChecklistItem {
  text: string;
  done: boolean;
}

export interface PlanSection {
  title: string;
  items: PlanChecklistItem[];
}

export interface PlanPhase {
  number: number;
  code: string;
  title: string;
  status: PlanStatus;
  objective: string;
  estimate: string;
  dependency: string;
  milestone: "A" | "B" | "C";
  sections: PlanSection[];
  gate: PlanSection & {
    approvedBy: string;
    approvedAt: string;
    evidence: string;
  };
  completedItems: number;
  totalItems: number;
}

export interface ImplementationPlan {
  version: string;
  createdAt: string;
  updatedAt: string;
  currentPhaseLabel: string;
  currentPhaseNumber: number;
  overallStatus: PlanStatus;
  approver: string;
  phases: PlanPhase[];
  completedPhases: number;
  completedItems: number;
  totalItems: number;
}

interface PhaseTableRow {
  title: string;
  status: PlanStatus;
  estimate: string;
  dependency: string;
  milestone: "A" | "B" | "C";
}

const PLAN_PATH = path.resolve(process.cwd(), "..", "PLANO_IMPLEMENTACAO.md");

const PLAN_STATUSES: PlanStatus[] = ["NÃO INICIADA", "PRONTA PARA INICIAR", "EM ANDAMENTO", "BLOQUEADA", "EM VALIDAÇÃO", "CONCLUÍDA"];

function normalizeStatus(value: string): PlanStatus {
  const normalized = value.trim().replace(/\s{2,}$/g, "") as PlanStatus;
  return PLAN_STATUSES.includes(normalized) ? normalized : "NÃO INICIADA";
}

function cleanInlineMarkdown(value: string) {
  return value
    .trim()
    .replace(/\s{2,}$/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1");
}

function meta(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`^> \\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m"));
  return cleanInlineMarkdown(match?.[1] ?? "—");
}

function parsePhaseTable(markdown: string) {
  const rows = new Map<number, PhaseTableRow>();

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| F")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 5) continue;

    const phase = cells[0].match(/^F(\d+) — (.+)$/);
    if (!phase) continue;

    rows.set(Number(phase[1]), {
      title: phase[2],
      status: normalizeStatus(cells[1]),
      estimate: cells[2],
      dependency: cells[3],
      milestone: (cells[4] as "A" | "B" | "C") || "A",
    });
  }

  return rows;
}

function parseChecklistItems(sectionBody: string): PlanChecklistItem[] {
  return [...sectionBody.matchAll(/^(?:-|\d+\.) \[([ xX])\] (.+)$/gm)].map((match) => ({
    done: match[1].toLowerCase() === "x",
    text: cleanInlineMarkdown(match[2]),
  }));
}

function parseSections(block: string): PlanSection[] {
  const headings = [...block.matchAll(/^#### (.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index! + heading[0].length;
    const end = headings[index + 1]?.index ?? block.length;
    return {
      title: cleanInlineMarkdown(heading[1]),
      items: parseChecklistItems(block.slice(start, end)),
    };
  });
}

function extractField(block: string, label: string) {
  const match = block.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m"));
  return cleanInlineMarkdown(match?.[1] ?? "—");
}

export function parseImplementationPlan(markdown: string): ImplementationPlan {
  const table = parsePhaseTable(markdown);
  const phaseHeadings = [...markdown.matchAll(/^### Fase (\d+) — (.+)$/gm)];
  const detailedSectionEnd = markdown.search(/^## 11\. /m);

  const phases = phaseHeadings.map((heading, index): PlanPhase => {
    const number = Number(heading[1]);
    const start = heading.index!;
    const nextStart = phaseHeadings[index + 1]?.index;
    const end = nextStart ?? (detailedSectionEnd > start ? detailedSectionEnd : markdown.length);
    const block = markdown.slice(start, end);
    const tableRow = table.get(number);
    const sections = parseSections(block);
    const gateSection = sections.find((section) => section.title.startsWith("Gate G")) ?? { title: `Gate G${number}`, items: [] };
    const allItems = sections.flatMap((section) => section.items);

    return {
      number,
      code: `F${number}`,
      title: cleanInlineMarkdown(heading[2]),
      status: normalizeStatus(extractField(block, "Estado") !== "—" ? extractField(block, "Estado") : tableRow?.status ?? "NÃO INICIADA"),
      objective: extractField(block, "Objetivo"),
      estimate: tableRow?.estimate ?? "—",
      dependency: tableRow?.dependency ?? "—",
      milestone: tableRow?.milestone ?? "A",
      sections: sections.filter((section) => section !== gateSection),
      gate: {
        ...gateSection,
        approvedBy: extractField(block, "Aprovado por"),
        approvedAt: extractField(block, "Data"),
        evidence: extractField(block, "Evidências"),
      },
      completedItems: allItems.filter((item) => item.done).length,
      totalItems: allItems.length,
    };
  });

  const currentPhaseLabel = meta(markdown, "Fase atual");
  const currentPhaseNumber = Number(currentPhaseLabel.match(/Fase (\d+)/)?.[1] ?? 0);
  const completedItems = phases.reduce((sum, phase) => sum + phase.completedItems, 0);
  const totalItems = phases.reduce((sum, phase) => sum + phase.totalItems, 0);

  return {
    version: meta(markdown, "Versão"),
    createdAt: meta(markdown, "Criado em"),
    updatedAt: meta(markdown, "Atualizado em"),
    currentPhaseLabel,
    currentPhaseNumber,
    overallStatus: normalizeStatus(meta(markdown, "Estado geral")),
    approver: meta(markdown, "Responsável por aprovar os gates"),
    phases,
    completedPhases: phases.filter((phase) => phase.status === "CONCLUÍDA").length,
    completedItems,
    totalItems,
  };
}

export async function getImplementationPlan() {
  const markdown = await readFile(PLAN_PATH, "utf8");
  return parseImplementationPlan(markdown);
}
