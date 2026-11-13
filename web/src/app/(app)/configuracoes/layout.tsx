"use client";

import { Bell, Columns3, History, ListChecks, Target, UserRound, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isManager } from "@/lib/constants";
import { useCurrentUser } from "@/lib/store";
import { cn } from "@/lib/utils";

type Access = "todos" | "gestor" | "admin";

const ITEMS: { href: string; label: string; icon: ReactNode; access: Access; group: string }[] = [
  { href: "/configuracoes", label: "Minha conta", icon: <UserRound size={16} />, access: "todos", group: "Pessoal" },
  { href: "/configuracoes/lembretes", label: "Lembretes", icon: <Bell size={16} />, access: "todos", group: "Pessoal" },
  { href: "/configuracoes/etapas", label: "Requisitos das etapas", icon: <Columns3 size={16} />, access: "admin", group: "Processo" },
  { href: "/configuracoes/atividades", label: "Requisitos das atividades", icon: <Workflow size={16} />, access: "admin", group: "Processo" },
  { href: "/configuracoes/metas", label: "Metas", icon: <Target size={16} />, access: "admin", group: "Processo" },
  { href: "/configuracoes/equipe", label: "Equipe", icon: <Users size={16} />, access: "admin", group: "Sistema" },
  { href: "/configuracoes/auditoria", label: "Auditoria", icon: <History size={16} />, access: "gestor", group: "Sistema" },
  { href: "/configuracoes/implementacao", label: "Implementação", icon: <ListChecks size={16} />, access: "admin", group: "Sistema" },
];

/** Configurações: um menu só para conta, processo e sistema. Cada pessoa vê o que pode mexer. */
export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const can = (access: Access) => access === "todos" || (access === "gestor" && isManager(user)) || user.role === "admin";
  const items = ITEMS.filter((i) => can(i.access));
  const current = ITEMS.find((i) => i.href === pathname);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Configurações" className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 hidden text-[18px] font-semibold text-ink lg:block">Configurações</div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto lg:block lg:space-y-4">
          {groups.map((group) => (
            <div key={group} className="flex gap-1 lg:block">
              <div className="label hidden px-2.5 pb-1 lg:block">{group}</div>
              {items
                .filter((i) => i.group === group)
                .map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors",
                      pathname === i.href ? "bg-soft font-medium text-ink" : "text-muted hover:bg-soft/70 hover:text-ink",
                    )}
                  >
                    <span className={pathname === i.href ? "text-navy" : "text-muted"}>{i.icon}</span>
                    {i.label}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0">
        {current && !can(current.access) ? (
          <div className="rounded-[8px] border border-line bg-white px-6 py-10 text-center text-[13px] text-muted">Esta parte das configurações é só para {current.access === "admin" ? "administradores" : "gestores"}.</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
