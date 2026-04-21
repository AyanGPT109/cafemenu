/**
 * Fallback client for unbundled /admin.js only.
 * Prefer opening admin via /admin/ or /admin.html (Vite build injects env into the bundle).
 * Replace placeholders if you serve plain modules from / without a build step.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://kqjaavvwocfgnbinehap.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxamFhdnZ3b2NmZ25iaW5laGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzIxMDAsImV4cCI6MjA5MTI0ODEwMH0.-7mBi797VJT-FrIeGddv3J9B0v6ab_X4uYiGnk_OolU";

if (!supabaseUrl.startsWith("http") || supabaseKey.startsWith("PASTE_")) {
  console.warn(
    "[Supabase] Edit public/supabaseClient.js with your URL and anon key, or use the Vite-built /admin.html (set VITE_* in Vercel)."
  );
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
