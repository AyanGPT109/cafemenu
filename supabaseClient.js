// Vite-based Supabase client (ESM).
// Note: Using CDN ESM import so we do NOT modify package.json.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Set them in .env then restart `npm run dev`."
  );
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
