// supabase/functions/buscar-festas/index.ts
// Edge Function segura: recebe cidade+estado, consulta SerpAPI + calendário fixo interno
// A chave da SerpAPI fica guardada como Supabase Secret (SERPAPI_KEY), nunca no frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── CALENDÁRIO FIXO INTERNO ─────────────────────────────────────────────────

function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function calcularCarnaval(ano: number): { inicio: string; fim: string } {
  const pascoa = calcularPascoa(ano);
  const quartaCinzas = new Date(pascoa.getTime() - 46 * 86400000);
  const sabado = new Date(quartaCinzas.getTime() - 4 * 86400000);
  return {
    inicio: sabado.toISOString().split("T")[0],
    fim: quartaCinzas.toISOString().split("T")[0],
  };
}

function toISO(ano: number, mes: number, dia: number): string {
  return new Date(ano, mes - 1, dia).toISOString().split("T")[0];
}

interface Festa {
  nome: string;
  data: string;
  categoria: string;
  impacto: string;
  tipo: "FIXO" | "GOOGLE";
  dica: string;
  endereco?: string;
  dias_restantes?: number;
  urgencia?: string;
  thumbnail?: string;
}

function getFestasFixas(cidade: string, uf: string, ano: number): Festa[] {
  const cidadeUpper = cidade.toUpperCase().trim();
  const ufUpper = uf.toUpperCase().trim();
  const carnaval = calcularCarnaval(ano);
  const festas: Festa[] = [];

  // ── Nacionais
  festas.push(
    { nome: "🎭 Carnaval — Início", data: carnaval.inicio, categoria: "NACIONAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Maior pico de consumo de gelo do ano. Estoque máximo 7 dias antes." },
    { nome: "🎭 Carnaval — Encerramento (Cinzas)", data: carnaval.fim, categoria: "NACIONAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Pico se mantém até o final. Repor estoque na segunda-feira." },
    { nome: "🎅 Natal", data: toISO(ano, 12, 25), categoria: "NACIONAL", impacto: "ALTO", tipo: "FIXO", dica: "Alta demanda em festas de fim de ano e confraternizações." },
    { nome: "🎆 Réveillon", data: toISO(ano, 12, 31), categoria: "NACIONAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Segunda maior data do ano. Preparar estoque 10 dias antes." },
    { nome: "💝 Dia dos Namorados", data: toISO(ano, 6, 12), categoria: "NACIONAL", impacto: "ALTO", tipo: "FIXO", dica: "Alta demanda em bares, restaurantes e delivery." },
    { nome: "🇧🇷 Independência do Brasil", data: toISO(ano, 9, 7), categoria: "NACIONAL", impacto: "MEDIO", tipo: "FIXO", dica: "Feriado com festas, churrasco e eventos." },
  );

  // ── Nordeste / Festas Juninas
  festas.push(
    { nome: "🌽 Início da Temporada Junina", data: toISO(ano, 6, 1), categoria: "NORDESTE", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Todo junho é alta temporada. Preparar estoque máximo desde maio." },
    { nome: "🎇 Festa de Santo Antônio", data: toISO(ano, 6, 13), categoria: "NORDESTE", impacto: "ALTO", tipo: "FIXO", dica: "Grande movimentação em cidades do interior." },
    { nome: "🎆 Festa de São João", data: toISO(ano, 6, 24), categoria: "NORDESTE", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Pico máximo das festas juninas. Maior data do Nordeste." },
    { nome: "🎇 Festa de São Pedro", data: toISO(ano, 6, 29), categoria: "NORDESTE", impacto: "ALTO", tipo: "FIXO", dica: "Encerramento do ciclo junino com festas em todo o interior." },
  );

  // ── Festas municipais: Ibotirama
  if (cidadeUpper.includes("IBOTIRAMA") || (ufUpper === "BA" && cidadeUpper.includes("IBOTIRAMA"))) {
    festas.push(
      { nome: "🏛️ Aniversário de Ibotirama", data: toISO(ano, 1, 26), categoria: "MUNICIPAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Maior festa municipal da cidade. Forró, shows e grande público." },
    );
  }

  // ── Festas municipais: Barreiras
  if (cidadeUpper.includes("BARREIRAS")) {
    festas.push(
      { nome: "🏛️ Aniversário de Barreiras", data: toISO(ano, 7, 23), categoria: "MUNICIPAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Principal festa do município. Shows e festas durante toda a semana." },
    );
  }

  // ── Festas municipais: Bom Jesus da Lapa
  if (cidadeUpper.includes("BOM JESUS") || cidadeUpper.includes("LAPA")) {
    festas.push(
      { nome: "✝️ Romaria de Bom Jesus da Lapa", data: toISO(ano, 8, 6), categoria: "MUNICIPAL", impacto: "ALTÍSSIMO", tipo: "FIXO", dica: "Uma das maiores romarias da Bahia. Mais de 1 milhão de visitantes na semana." },
    );
  }

  // ── Festas municipais: Guanambi
  if (cidadeUpper.includes("GUANAMBI")) {
    festas.push(
      { nome: "🏛️ Aniversário de Guanambi", data: toISO(ano, 10, 2), categoria: "MUNICIPAL", impacto: "ALTO", tipo: "FIXO", dica: "Festas e shows na cidade." },
    );
  }

  return festas;
}

// ─── BUSCA SERPAPI ────────────────────────────────────────────────────────────

async function buscarGoogleEvents(
  cidade: string,
  uf: string,
  serpApiKey: string
): Promise<Festa[]> {
  const queries = [
    `festas e eventos em ${cidade} ${uf}`,
    `shows eventos ${cidade}`,
    `agenda cultural ${cidade}`,
  ];

  const encontrados: Festa[] = [];
  const vistos = new Set<string>();

  const mesesEn: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const extrairDataISO = (when: string): string | null => {
    if (!when) return null;
    const ano = new Date().getFullYear();
    // Formato "Sat, Jun 21" ou "Jun 21"
    const lower = when.toLowerCase().replace(",", "");
    for (const [mes, num] of Object.entries(mesesEn)) {
      if (lower.includes(mes)) {
        const parts = lower.split(" ").filter(Boolean);
        const idx = parts.indexOf(mes);
        if (idx >= 0 && parts[idx + 1]) {
          const dia = parseInt(parts[idx + 1]);
          if (!isNaN(dia)) {
            let d = new Date(ano, num - 1, dia);
            if (d < new Date()) d = new Date(ano + 1, num - 1, dia);
            return d.toISOString().split("T")[0];
          }
        }
      }
    }
    return null;
  };

  for (const q of queries) {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_events");
    url.searchParams.set("q", q);
    url.searchParams.set("api_key", serpApiKey);
    url.searchParams.set("hl", "pt");
    url.searchParams.set("gl", "br");
    url.searchParams.set("location", `${cidade}, ${uf}, Brazil`);

    try {
      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
      if (!resp.ok) continue;
      const data = await resp.json();

      for (const ev of (data.events_results ?? [])) {
        const title: string = ev.title ?? "";
        if (!title || vistos.has(title)) continue;
        vistos.add(title);

        const when = ev.date?.when ?? "";
        const dataISO = extrairDataISO(when);
        if (!dataISO) continue;

        const hoje = new Date();
        const evDate = new Date(dataISO + "T12:00:00");
        const diasRestantes = Math.floor((evDate.getTime() - hoje.getTime()) / 86400000);
        if (diasRestantes < 0 || diasRestantes > 180) continue;

        const addr = Array.isArray(ev.address) ? ev.address.join(", ") : (ev.address ?? "");
        encontrados.push({
          nome: title,
          data: dataISO,
          categoria: "GOOGLE",
          impacto: diasRestantes <= 7 ? "ALTO" : "MEDIO",
          tipo: "GOOGLE",
          dica: "Evento encontrado via Google Events. Confirme com o organizador.",
          endereco: addr,
          thumbnail: ev.thumbnail ?? "",
        });
      }
    } catch (err) {
      console.error(`Erro SerpAPI (${q}):`, err);
    }
  }

  return encontrados;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cidade, estado, dias_frente = 90 } = await req.json();

    if (!cidade || !estado) {
      return new Response(
        JSON.stringify({ error: "cidade e estado são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serpApiKey = Deno.env.get("SERPAPI_KEY") ?? "";
    const hoje = new Date();
    const ano = hoje.getFullYear();

    // 1. Festas fixas
    const festasFixas = getFestasFixas(cidade, estado, ano);
    // Se perto do final do ano, inclui próximo
    let todasFixas = festasFixas;
    if (hoje.getMonth() >= 9) {
      todasFixas = [...festasFixas, ...getFestasFixas(cidade, estado, ano + 1)];
    }

    // Filtra por janela
    const calcDias = (d: string) =>
      Math.floor((new Date(d + "T12:00:00").getTime() - hoje.getTime()) / 86400000);

    const urgencia = (d: number) =>
      d < 0 ? "PASSADO" : d <= 7 ? "🔴 URGENTE" : d <= 30 ? "🟡 PRÓXIMO" : "🟢 PLANEJE";

    const fixasFiltradas: Festa[] = todasFixas
      .map((f) => ({ ...f, dias_restantes: calcDias(f.data), urgencia: urgencia(calcDias(f.data)) }))
      .filter((f) => (f.dias_restantes ?? 0) >= 0 && (f.dias_restantes ?? 9999) <= dias_frente);

    // 2. Google Events via SerpAPI
    let eventosGoogle: Festa[] = [];
    if (serpApiKey) {
      eventosGoogle = await buscarGoogleEvents(cidade, estado, serpApiKey);
      eventosGoogle = eventosGoogle.map((e) => ({
        ...e,
        dias_restantes: calcDias(e.data),
        urgencia: urgencia(calcDias(e.data)),
      }));
    }

    // 3. Unifica e ordena por data
    const impactoOrder: Record<string, number> = { ALTÍSSIMO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 };
    const todas = [...fixasFiltradas, ...eventosGoogle].sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        (impactoOrder[a.impacto] ?? 3) - (impactoOrder[b.impacto] ?? 3)
    );

    return new Response(
      JSON.stringify({
        cidade,
        estado,
        consultado_em: hoje.toISOString().split("T")[0],
        janela_dias: dias_frente,
        total: todas.length,
        festas: todas,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro na Edge Function buscar-festas:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
