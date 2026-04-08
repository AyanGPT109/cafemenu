/**
 * Fallback client for unbundled /admin.js only.
 * Prefer opening admin via /admin/ or /admin.html (Vite build injects env into the bundle).
 * Replace placeholders if you serve plain modules from / without a build step.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "PASTE_SUPABASE_URL";
const supabaseKey = "PASTE_SUPABASE_ANON_KEY";

if (!supabaseUrl.startsWith("http") || supabaseKey.startsWith("PASTE_")) {
  console.warn(
    "[Supabase] Edit public/supabaseClient.js with your URL and anon key, or use the Vite-built /admin.html (set VITE_* in Vercel)."
  );
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
