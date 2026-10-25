// Creates hospital and funeral home staff accounts. Staff are seeded, not
// self-registered: handle_new_user always creates 'family' profiles, so only this
// script (service role) can assign the hospital or funeral_home role.
//
// Usage: npm run seed-funeral-home-users -- path/to/accounts.json
// accounts.json:
//   [{ "email": "staff@example.com", "password": "...", "role": "funeral_home",
//      "funeral_home_name": "Exact name in funeral_homes" },
//    { "email": "hospital@example.com", "password": "...", "role": "hospital" }]
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. Re-running is safe:
// existing auth users are reused and their password and profile are updated.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(): void {
  const envPath = path.resolve(__dirname, "..", ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env) && value) process.env[key] = value;
  }
}

loadEnv();

interface SeedAccount {
  email: string;
  password: string;
  role: "hospital" | "funeral_home";
  funeral_home_name?: string;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run seed-funeral-home-users -- path/to/accounts.json");
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const accounts = JSON.parse(readFileSync(inputPath, "utf8")) as SeedAccount[];

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

async function main(): Promise<void> {
  for (const account of accounts) {
    let funeralHomeId: string | null = null;
    if (account.role === "funeral_home") {
      if (!account.funeral_home_name) throw new Error(`${account.email}: funeral_home_name is required.`);
      const { data: homes, error: homeErr } = await admin
        .from("funeral_homes")
        .select("id, name")
        .eq("name", account.funeral_home_name);
      if (homeErr) throw homeErr;
      if (!homes || homes.length !== 1) {
        throw new Error(
          `Expected exactly one funeral home named "${account.funeral_home_name}", found ${homes?.length ?? 0}.`,
        );
      }
      funeralHomeId = homes[0].id;
    } else if (account.funeral_home_name) {
      throw new Error(`${account.email}: funeral_home_name only applies to role funeral_home.`);
    }

    let userId = await findAuthUserIdByEmail(account.email);
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: account.password });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser returned no user");
      userId = data.user.id;
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({ id: userId, role: account.role, funeral_home_id: funeralHomeId });
    if (profileErr) throw profileErr;

    console.log(`ok  ${account.email} (${account.role}${funeralHomeId ? `, ${account.funeral_home_name}` : ""})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
