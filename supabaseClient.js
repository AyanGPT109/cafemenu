import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Set them in Vercel env (or .env locally) and rebuild."
  );
}

export const supabaseClient = createClient(supabaseUrl ?? "", supabaseKey ?? "");
