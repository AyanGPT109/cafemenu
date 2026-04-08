// Supabase client for production (no Vite env)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ DIRECT VALUES (since public folder cannot use import.meta.env)
const supabaseUrl = "https://kqjaawvwocfgnbinehap.supabase.co";
const supabaseKey = "YOUR_PUBLIC_ANON_KEY";

export const supabaseClient = createClient(supabaseUrl, supabaseKey);