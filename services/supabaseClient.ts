import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://otvvimgvxhtvlmgxwrac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90dnZpbWd2eGh0dmxtZ3h3cmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDgyODMsImV4cCI6MjA4MTEyNDI4M30.uvfOs_yC6EeufXsI8nG5RTiVje8MBPQDeBfcqZfcbPA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
