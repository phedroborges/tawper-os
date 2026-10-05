import { redirect } from "next/navigation";

// Sem login: a demo abre direto no sistema.
export default function Home() {
  redirect("/meu-dia");
}
