import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '../src/config/env';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
