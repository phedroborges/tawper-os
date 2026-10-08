/**
 * Aplica as migrations no Postgres do projeto.
 * Prefere DATABASE_URL; senão tenta o host oficial com a service role.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const envPath = join(webRoot, ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const ref = new URL(url).hostname.split(".")[0];
const explicit = process.env.DATABASE_URL || env.DATABASE_URL;

const candidates = [
  explicit,
  `postgresql://postgres.${ref}:${encodeURIComponent(service)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(service)}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(service)}@db.${ref}.supabase.co:5432/postgres`,
].filter(Boolean);

const dir = join(webRoot, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

async function apply(connectionUrl) {
  const sql = postgres(connectionUrl, { max: 1, ssl: "require", connect_timeout: 12 });
  try {
    await sql`select 1`;
    await sql`create schema if not exists supabase_migrations`;
    await sql`
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        name text not null,
        applied_at timestamptz not null default now()
      )`;
    const done = await sql`select version from supabase_migrations.schema_migrations`;
    const applied = new Set(done.map((r) => r.version));
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log("skip", file);
        continue;
      }
      const body = readFileSync(join(dir, file), "utf8").replace(/^\uFEFF/, "");
      console.log("apply", file);
      await sql.unsafe(body);
      await sql`insert into supabase_migrations.schema_migrations (version, name) values (${version}, ${file})`;
    }
    console.log("ok", files.length, "migrations");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

let lastErr;
for (const c of candidates) {
  try {
    await apply(c);
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.warn("falhou um endpoint:", e.message || e);
  }
}
console.error("Não foi possível aplicar. Defina DATABASE_URL com a senha do banco (Supabase > Project Settings > Database).");
if (lastErr) console.error(lastErr.message || lastErr);
process.exit(1);
