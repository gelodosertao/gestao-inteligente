import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);

const NF_SERIES = 1;

export async function getNextNnf(): Promise<number> {
  const { data, error } = await supabase.rpc('increment_nfe_counter', {
    p_series: NF_SERIES,
  });

  if (error) {
    throw new Error(`Falha ao obter próximo nNF: ${error.message}`);
  }

  return data as number;
}

export async function cancelNnf(series: number = NF_SERIES): Promise<void> {
  const { error } = await supabase.rpc('cancel_nfe_counter', {
    p_series: series,
  });

  if (error) {
    console.error(`[NfeCounterService] Falha ao reverter contador nNF: ${error.message}`);
  }
}

export async function getCurrentNnf(): Promise<number> {
  const { data, error } = await supabase
    .from('nfe_counters')
    .select('last_nnf')
    .eq('series', NF_SERIES)
    .single();

  if (error || !data) {
    throw new Error(`Falha ao consultar nNF atual: ${error?.message || 'sem dados'}`);
  }

  return data.last_nnf;
}
