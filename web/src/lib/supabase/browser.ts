"use client";

export const isSupabaseEnabled =
  process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true" || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
