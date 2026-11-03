import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let anon: SupabaseClient | null = null;

/** Cliente com a anon key — usado só para signInWithPassword (Auth). */
export function getSupabaseAnon(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!anon) {
    anon = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anon;
}
