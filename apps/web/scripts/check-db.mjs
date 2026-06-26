import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dirname, "..");

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnv(resolve(webDir, ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("Fetching Wirtschaftspläne...");
const { data: plans, error: pErr } = await supabase.from("wirtschaftsplan").select("*");
if (pErr) console.error("Error fetching plans:", pErr);
else console.log("Plans found:", plans);

console.log("\nFetching WEGs...");
const { data: wegs, error: wErr } = await supabase.from("weg").select("*");
if (wErr) console.error("Error fetching wegs:", wErr);
else console.log("WEGs found:", wegs);

console.log("\nFetching Units...");
const { data: units, error: uErr } = await supabase.from("unit").select("*");
if (uErr) console.error("Error fetching units:", uErr);
else console.log("Units found:", units);

console.log("\nFetching Sollstellungen...");
const { data: sollstellungen, error: sErr } = await supabase.from("sollstellung").select("*");
if (sErr) console.error("Error fetching sollstellungen:", sErr);
else console.log("Sollstellungen count:", sollstellungen?.length, "\nSollstellungen:", sollstellungen);
