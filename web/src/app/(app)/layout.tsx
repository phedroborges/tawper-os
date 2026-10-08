import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
