import { IaSessionsConsole } from "@/components/chat/IaSessionsConsole";

export const dynamic = "force-dynamic";

export default async function ConversasPage({ searchParams }: PageProps<"/conversas">) {
  const { tab } = await searchParams;
  return <IaSessionsConsole initialTab={tab === "registros" ? "registros" : "equipe"} />;
}
