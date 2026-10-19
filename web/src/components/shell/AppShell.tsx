"use client";

import {
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  Columns3,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Route,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Tv,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/primitives";
import { MenuItem, Popover } from "@/components/ui/overlay";
import { ROLE_LABEL, isManager } from "@/lib/constants";
import { fmtAgo } from "@/lib/dates";
import { useMounted } from "@/lib/hooks";
import { alertsOf, canSeeCompany } from "@/lib/selectors";
import { STORAGE_KEY, useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { digitsQueryMatch } from "@/lib/br-ids";
import { cn, normalize } from "@/lib/utils";
import { ConversasLoading } from "@/components/chat/ConversasLoading";
import { ChatDock, InboxButton, InboxUnreadSync } from "@/components/chat/ChatDock";
import { CrmSync, DbStatus, SupabaseBridge } from "./SupabaseBridge";
import { Toaster } from "./Toaster";

const FlowHost = dynamic(() => import("@/components/flows/FlowHost").then((m) => m.FlowHost), { ssr: false });
const AssistantPanel = dynamic(() => import("./Assistant").then((m) => m.AssistantPanel), { ssr: false });
const DemoGuide = dynamic(() => import("./DemoGuide").then((m) => m.DemoGuide), { ssr: false });

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  manager?: boolean;
}

/** Telas de dados que aproveitam toda a largura do monitor. */
const FLUID_ROUTES = ["/funis", "/carteira", "/auditoria", "/dashboard", "/catalogo"];

function useNav(): NavItem[] {
  const user = useCurrentUser();
  const conversations = useStore((s) => s.conversations);
  const liveUnread = useUI((s) => s.liveUnread);
  const companies = useStore((s) => s.companies);
  const contacts = useStore((s) => s.contacts);
  const deals = useStore((s) => s.deals);
  const activities = useStore((s) => s.activities);
  const interactions = useStore((s) => s.interactions);
  const quotes = useStore((s) => s.quotes);
  const suggestions = useStore((s) => s.suggestions);
  const strategies = useStore((s) => s.strategies);
  const users = useStore((s) => s.users);
  const unread = useMemo(() => conversations.filter((c) => {
    if (!c.unread) return false;
    if (isManager(user)) return true;
    if (c.ownerId === user.id) return true;
    const co = companies.find((x) => x.id === c.companyId);
    return co ? canSeeCompany(user, co) : false;
  }).length, [conversations, companies, user]);
  const exceptions = useMemo(
    () => alertsOf({ companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations }).filter((a) => a.severidade === "alta").length,
    [companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations],
  );
  return [
    { href: "/meu-dia", label: "Meu dia", icon: <Sun size={18} /> },
    { href: "/carteira", label: "Carteira", icon: <Building2 size={18} /> },
    { href: "/funis", label: "Funis", icon: <Columns3 size={18} /> },
    { href: "/conversas", label: "Conversas", icon: <MessageCircle size={18} />, badge: liveUnread ?? unread },
    { href: "/catalogo", label: "Catálogo", icon: <Package size={18} /> },
    { href: "/rotas", label: "Rotas", icon: <Route size={18} /> },
    { href: "/implementacao", label: "Implementação", icon: <ListChecks size={18} /> },
    { href: "/gestao", label: "Gestão", icon: <ShieldCheck size={18} />, badge: exceptions, manager: true },
    { href: "/dashboard", label: "Painel", icon: <LayoutDashboard size={18} />, manager: true },
    { href: "/auditoria", label: "Auditoria", icon: <History size={18} />, manager: true },
  ];
}

function Sidebar({ onNavigate, onConversasIntent, collapsed = false }: { onNavigate?: () => void; onConversasIntent?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const setNavCollapsed = useUI((s) => s.setNavCollapsed);
  const user = useCurrentUser();
  const nav = useNav();
  const { setGuide, toast } = useUI();
  const resetDemo = useStore((s) => s.resetDemo);
  const manager = isManager(user);

  const item = (n: NavItem) => {
    const active = pathname === n.href || pathname.startsWith(`${n.href}/`) || (n.href === "/carteira" && pathname.startsWith("/empresas"));
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={() => {
          if (n.href === "/conversas") onConversasIntent?.();
          onNavigate?.();
        }}
        title={collapsed ? n.label : undefined}
        aria-label={collapsed ? n.label : undefined}
        className={cn(
          "relative flex items-center rounded-[6px] py-2 text-[13.5px] transition-colors",
          collapsed ? "justify-center px-0" : "gap-3 px-2.5",
          active ? "bg-soft font-medium text-ink" : "text-muted hover:bg-soft/70 hover:text-ink",
        )}
      >
        <span className={cn(active ? "text-navy" : "text-muted")}>{n.icon}</span>
        {!collapsed && <span className="flex-1">{n.label}</span>}
        {Boolean(n.badge) &&
          (collapsed ? (
            <span className="absolute top-1 right-2 size-2 rounded-full bg-brand" />
          ) : (
            <span className={cn("rounded-full px-1.5 text-[10.5px] leading-[18px] font-medium", active ? "bg-navy text-white" : "bg-soft-2 text-muted")}>{n.badge}</span>
          ))}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col border-r border-line bg-white">
      <div className={cn("flex items-center pt-5 pb-5", collapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/meu-dia" onClick={onNavigate} className="block" title="Tawper">
          {collapsed ? (
            <span className="grid size-9 place-items-center rounded-[9px] bg-brand text-[18px] font-black text-white">T</span>
          ) : (
            <Image src="/brand/tawper-logo.png" alt="Tawper" width={293} height={83} className="h-auto w-[112px]" priority />
          )}
        </Link>
      </div>
      <nav className={cn("flex-1 space-y-0.5 overflow-y-auto", collapsed ? "px-2" : "px-2.5")}>
        {nav.filter((n) => !n.manager).map(item)}
        {manager && (
          <>
            {collapsed ? <div className="mx-2 my-3 h-px bg-line" /> : <div className="label px-2.5 pt-5 pb-1.5">Gestão</div>}
            {nav.filter((n) => n.manager).map(item)}
          </>
        )}
      </nav>
      {!onNavigate && (
        <div className={cn("border-t border-line py-2", collapsed ? "px-2" : "px-2.5")}>
          <button
            type="button"
            onClick={() => setNavCollapsed(!collapsed)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn("flex w-full items-center rounded-[6px] py-1.5 text-[12.5px] text-muted transition-colors hover:bg-soft hover:text-ink", collapsed ? "justify-center" : "gap-3 px-2.5")}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!collapsed && "Recolher menu"}
          </button>
        </div>
      )}
      <div className={cn("space-y-0.5 border-t border-line px-2.5 py-3", collapsed && "hidden")}>
        <button
          type="button"
          onClick={() => {
            setGuide(true);
            onNavigate?.();
          }}
          className="flex w-full items-center gap-3 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-soft hover:text-ink"
        >
          <BookOpen size={15} /> Roteiro da demo
        </button>
        <Link href="/celular" onClick={onNavigate} className="flex items-center gap-3 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-soft hover:text-ink">
          <Smartphone size={15} /> Ver no celular
        </Link>
        <Link href="/tv" onClick={onNavigate} className="flex items-center gap-3 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-soft hover:text-ink">
          <Tv size={15} /> Modo TV
        </Link>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reiniciar a demonstração? Todos os dados voltam ao estado inicial.")) {
              resetDemo();
              toast("Demo reiniciada", { tone: "info", sub: "Clientes e datas voltaram ao início" });
            }
          }}
          className="flex w-full items-center gap-3 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-soft hover:text-ink"
        >
          <RotateCcw size={15} /> Reiniciar demo
        </button>
      </div>
    </div>
  );
}

function UserSwitcher() {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const login = useStore((s) => s.login);
  const toast = useUI((s) => s.toast);
  const router = useRouter();
  return (
    <Popover
      className="w-72 py-1.5"
      trigger={(open) => (
        <button type="button" className={cn("flex items-center gap-2 rounded-[6px] py-1 pr-1.5 pl-1 hover:bg-soft", open && "bg-soft")}>
          <Avatar name={user.name} initials={user.initials} color={user.color} size={30} />
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-[12.5px] font-medium text-ink">{user.short}</span>
            <span className="block text-[11px] text-muted">{ROLE_LABEL[user.role]}</span>
          </span>
          <ChevronDown size={14} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-3 pt-1 pb-2 text-[11.5px] text-muted">Ver o sistema como:</div>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                login(u.id);
                close();
                toast(`Visualizando como ${u.short}`, { tone: "info", sub: ROLE_LABEL[u.role] });
                if (!isManager(u) && ["/gestao", "/dashboard", "/auditoria"].some((p) => window.location.pathname.startsWith(p))) router.push("/meu-dia");
              }}
              className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-soft", u.id === user.id && "bg-soft")}
            >
              <Avatar name={u.name} initials={u.initials} color={u.color} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{u.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{ROLE_LABEL[u.role]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function Notifications() {
  const user = useCurrentUser();
  const notifications = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markNotificationsRead);
  const router = useRouter();
  const mine = notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const unread = mine.filter((n) => !n.lida).length;
  return (
    <Popover
      className="w-[340px] max-w-[calc(100vw-2rem)]"
      trigger={() => (
        <button type="button" className="relative grid size-9 place-items-center rounded-[6px] text-muted hover:bg-soft hover:text-ink" aria-label="Notificações">
          <Bell size={18} />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand" />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-medium">Notificações</span>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(user.id)} className="text-[12px] text-muted hover:text-ink">
                marcar como lidas
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
            {mine.length === 0 && <div className="px-4 py-8 text-center text-[12.5px] text-muted">Nada por aqui.</div>}
            {mine.map((n) => (
              <MenuItem
                key={n.id}
                onClick={() => {
                  close();
                  if (n.link) router.push(n.link);
                }}
                icon={
                  <span className={cn("grid size-6 place-items-center rounded-full", n.tipo === "ia" ? "bg-ai-soft text-ai" : n.tipo === "cobranca" ? "bg-brand-soft text-brand" : "bg-soft text-muted")}>
                    {n.tipo === "ia" ? <Sparkles size={12} /> : <Bell size={12} />}
                  </span>
                }
                sub={
                  <>
                    {n.texto}
                    <span className="mt-0.5 block text-[10.5px] text-muted/80">{fmtAgo(n.at)}</span>
                  </>
                }
              >
                <span className={cn(!n.lida && "font-medium")}>{n.titulo}</span>
              </MenuItem>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function GlobalSearch() {
  const user = useCurrentUser();
  const companies = useStore((s) => s.companies);
  const contacts = useStore((s) => s.contacts);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const results = useMemo(() => {
    const n = normalize(q);
    if (n.length < 2) return [];
    return companies
      .filter((c) => canSeeCompany(user, c))
      .filter((c) => {
        const companyContacts = contacts.filter((ct) => ct.companyId === c.id);
        return (
          normalize(`${c.nome} ${c.cidade ?? ""} ${c.codigo} ${c.razaoSocial} ${c.cnpj ?? ""}`).includes(n) ||
          digitsQueryMatch(q, c.cnpj, ...companyContacts.map((ct) => ct.whatsapp)) ||
          companyContacts.some((ct) => normalize(ct.nome).includes(n))
        );
      })
      .slice(0, 7);
  }, [q, companies, contacts, user]);
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            router.push(`/empresas/${results[0].id}`);
            setQ("");
          }
        }}
        placeholder="Buscar cliente ou contato"
        className="h-10 w-full rounded-[6px] border border-transparent bg-soft pr-3 pl-9 text-[13.5px] outline-none transition focus:border-line focus:bg-white"
      />
      {focus && results.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-[60] mt-1.5 overflow-hidden rounded-[8px] border border-line bg-white shadow-pop animate-fade-in">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => {
                router.push(`/empresas/${c.id}`);
                setQ("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-soft"
            >
              <Building2 size={14} className="text-muted" />
              <span className="flex-1 text-[13px] text-ink">{c.nome}</span>
              <span className="text-[11.5px] text-muted">
                {c.cidade}/{c.uf}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const { open, setAssistant, setMobileNav } = useUI();
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-line bg-paper/95 px-3 backdrop-blur md:gap-4 md:px-6">
      <button type="button" className="grid size-9 place-items-center rounded-[6px] text-muted hover:bg-soft md:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
        <Menu size={20} />
      </button>
      <Link href="/meu-dia" className="md:hidden">
        <Image src="/brand/tawper-logo.png" alt="Tawper" width={293} height={83} className="h-auto w-[92px]" />
      </Link>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <button
          type="button"
          onClick={() => setAssistant(true)}
          className="inline-flex h-10 items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] text-muted transition-colors hover:bg-soft hover:text-ink"
          title="Pergunte à IA"
        >
          <Sparkles size={17} /> <span className="hidden xl:inline">Pergunte à IA</span>
        </button>
        <InboxButton />
        <Notifications />
        <button type="button" onClick={() => open({ kind: "quick" })} className="inline-flex size-10 items-center justify-center gap-2 rounded-[6px] bg-navy text-[13.5px] font-medium text-white hover:bg-navy-2 sm:h-10 sm:w-auto sm:px-3.5">
          <Plus size={16} /> <span className="hidden sm:inline">Registrar</span>
        </button>
        <div className="mx-1 hidden h-6 w-px bg-line md:block" />
        <div className="hidden sm:block"><UserSwitcher /></div>
      </div>
    </header>
  );
}

function MobileTabBar({ onConversasIntent }: { onConversasIntent?: () => void }) {
  const pathname = usePathname();
  const open = useUI((s) => s.open);
  const nav = useNav();
  const items = [nav[0], nav[1], null, nav[3], nav[2]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((n, i) =>
        n ? (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => {
              if (n.href === "/conversas") onConversasIntent?.();
            }}
            className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10.5px]", pathname.startsWith(n.href) ? "font-medium text-navy" : "text-muted")}
          >
            {n.icon}
            {n.label.split(" ")[0]}
            {Boolean(n.badge) && <span className="absolute top-1 right-[calc(50%-18px)] size-1.5 rounded-full bg-brand" />}
          </Link>
        ) : (
          <button key={`reg-${i}`} type="button" onClick={() => open({ kind: "quick" })} className="flex flex-col items-center justify-center" aria-label="Registrar">
            <span className="-mt-5 grid size-12 place-items-center rounded-full bg-navy text-white shadow-pop">
              <Plus size={22} />
            </span>
          </button>
        ),
      )}
    </nav>
  );
}

function CrossTabSync() {
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) useStore.persist.rehydrate();
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  return null;
}

function Splash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-paper">
      <div className="flex flex-col items-center gap-4">
        <Image src="/brand/tawper-logo.png" alt="Tawper" width={293} height={83} className="h-auto w-[150px]" priority />
        <div className="h-0.5 w-32 overflow-hidden rounded bg-soft-2">
          <div className="h-full w-1/2 animate-pulse bg-navy" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const flow = useUI((s) => s.flow);
  const navCollapsed = useUI((s) => s.navCollapsed);
  const assistantOpen = useUI((s) => s.assistantOpen);
  const guideOpen = useUI((s) => s.guideOpen);
  const [extras, setExtras] = useState(false);
  const conversasLoading = useUI((s) => s.conversasLoading);
  const beginConversasLoad = useUI((s) => s.beginConversasLoad);
  const endConversasLoad = useUI((s) => s.endConversasLoad);
  useEffect(() => {
    if (!pathname.startsWith("/conversas")) endConversasLoad();
  }, [pathname, endConversasLoad]);
  const onConversasIntent = () => {
    if (!pathname.startsWith("/conversas")) beginConversasLoad();
  };
  useEffect(() => {
    const run = () => setExtras(true);
    const idle = window.requestIdleCallback?.(run, { timeout: 800 });
    if (idle !== undefined) return () => window.cancelIdleCallback(idle);
    const timer = window.setTimeout(run, 250);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <>
      <SupabaseBridge />
      <CrmSync />
      <InboxUnreadSync />
      {!mounted ? (
        <Splash />
      ) : (
        <div className="min-h-dvh bg-paper">
          <CrossTabSync />
          <aside className={cn("fixed inset-y-0 left-0 z-50 hidden transition-[width] duration-200 md:block", navCollapsed ? "w-[68px]" : "w-[224px]")}>
            <Sidebar onConversasIntent={onConversasIntent} collapsed={navCollapsed} />
          </aside>
          {mobileNav && (
            <div className="fixed inset-0 z-[75] bg-ink/30 md:hidden" onClick={() => setMobileNav(false)}>
              <aside className="h-full w-[248px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <Sidebar onNavigate={() => setMobileNav(false)} onConversasIntent={onConversasIntent} />
              </aside>
            </div>
          )}
          <div className={cn("transition-[padding] duration-200", navCollapsed ? "md:pl-[68px]" : "md:pl-[224px]")}>
            <Topbar />
            <DbStatus />
            <main
              className={cn(
                "mx-auto w-full",
                // Conversas ocupa a tela toda. Telas de dados (quadro, tabelas, painel) usam toda a largura;
                // as de leitura crescem até 1680px para a linha não ficar longa demais.
                pathname.startsWith("/conversas")
                  ? "px-3 pt-3 pb-20 md:px-4 md:pb-3"
                  : cn("px-4 pt-6 pb-28 md:px-6 md:pt-7 md:pb-14 2xl:px-8", !FLUID_ROUTES.some((r) => pathname.startsWith(r)) && "max-w-[1680px]"),
              )}
            >
              {children}
            </main>
          </div>
          <MobileTabBar onConversasIntent={onConversasIntent} />
          {conversasLoading && <ConversasLoading />}
          <ChatDock />
          {(extras || flow) && <FlowHost />}
          {(extras || assistantOpen) && <AssistantPanel />}
          {(extras || guideOpen) && <DemoGuide />}
          <Toaster />
        </div>
      )}
    </>
  );
}

export function ShellGate({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return <Splash />;
  return (
    <>
      <CrossTabSync />
      {children}
      <FlowHost />
      <Toaster />
    </>
  );
}
