import { redirect } from "next/navigation";

/** Registros virou uma aba do Atendimento IA; o endereço antigo continua valendo. */
export default function RegistrosPage() {
  redirect("/conversas?tab=registros");
}
