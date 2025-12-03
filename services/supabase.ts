import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://licetziylggxtnoutjkn.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpY2V0eml5bGdneHRub3V0amtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODQ2OTUsImV4cCI6MjA4MDI2MDY5NX0.olJiaq0HKZ3-DQlLjzBxodob9vaAxX2v9SaEmIRtO4w';

export const supabase = createClient(supabaseUrl, supabaseKey);