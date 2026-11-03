import { redirect } from "next/navigation";

/** Catálogo de produtos (SKU/preço) foi retirado. Use a proposta comercial. */
export default function CatalogoRedirectPage() {
  redirect("/propostas");
}
