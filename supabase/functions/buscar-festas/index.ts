// supabase/functions/buscar-festas/index.ts
// @ts-nocheck — Este arquivo roda no runtime Deno (Supabase Edge Functions).
// O compilador TypeScript local não reconhece imports por URL nem a global Deno.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Festa {
  nome: string;
  data_inicio: string;
  data_fim: string;
  data: string;             // = data_fim (compatibilidade)
  duracao_dias: number;
  categoria: string;
  impacto: string;
  tipo: "FIXO" | "GOOGLE";
  dica: string;
  endereco?: string;
  dias_restantes?: number;  // dias até o início
  urgencia?: string;
  thumbnail?: string;
}

// ─── UTILITÁRIOS DE DATA ─────────────────────────────────────────────────────

function toISO(ano: number, mes: number, dia: number): string {
  return new Date(ano, mes - 1, dia).toISOString().split("T")[0];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000
  ) + 1;
}

function calcularPascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function calcularCarnaval(ano: number): { inicio: string; fim: string } {
  const pascoa = calcularPascoa(ano);
  const terca = new Date(pascoa.getTime() - 47 * 86400000);
  const sabado = new Date(terca.getTime() - 3 * 86400000);
  return {
    inicio: sabado.toISOString().split("T")[0],
    fim: terca.toISOString().split("T")[0],
  };
}

function mkFesta(
  nome: string, inicio: string, fim: string,
  categoria: string, impacto: string, dica: string
): Festa {
  return {
    nome, data_inicio: inicio, data_fim: fim, data: fim,
    duracao_dias: diffDays(inicio, fim),
    categoria, impacto, tipo: "FIXO", dica,
  };
}

// ─── CALENDÁRIO FIXO ─────────────────────────────────────────────────────────

function getFestasFixas(cidade: string, uf: string, ano: number): Festa[] {
  const c = cidade.toUpperCase().trim();
  const u = uf.toUpperCase().trim();
  const carnaval = calcularCarnaval(ano);
  const festas: Festa[] = [];

  // Nacionais
  festas.push(mkFesta("Carnaval", carnaval.inicio, carnaval.fim,
    "NACIONAL", "ALTÍSSIMO",
    "Maior pico de consumo de gelo do ano. Estoque máximo 7 dias antes."));

  festas.push(mkFesta("Temporada Junina", toISO(ano, 6, 1), toISO(ano, 6, 30),
    "NORDESTE", "ALTÍSSIMO",
    "Todo junho é alta temporada. Prepare estoque máximo desde a última semana de maio."));

  festas.push(mkFesta("Festa de Santo Antônio", toISO(ano, 6, 12), toISO(ano, 6, 13),
    "NORDESTE", "ALTO",
    "Grande movimentação em cidades do interior baiano."));

  festas.push(mkFesta("Festa de São João", toISO(ano, 6, 23), toISO(ano, 6, 24),
    "NORDESTE", "ALTÍSSIMO",
    "Pico máximo das festas juninas. Maior data do Nordeste — prepare dobro do estoque."));

  festas.push(mkFesta("Festa de São Pedro", toISO(ano, 6, 28), toISO(ano, 6, 29),
    "NORDESTE", "ALTO",
    "Encerramento do ciclo junino com festas em todo o interior."));

  festas.push(mkFesta("Dia dos Namorados", toISO(ano, 6, 12), toISO(ano, 6, 12),
    "NACIONAL", "ALTO",
    "Alta demanda em bares, restaurantes e delivery de bebidas."));

  festas.push(mkFesta("Independência do Brasil", toISO(ano, 9, 7), toISO(ano, 9, 7),
    "NACIONAL", "MEDIO",
    "Feriado com festas, churrasco e eventos públicos."));

  festas.push(mkFesta("Natal", toISO(ano, 12, 24), toISO(ano, 12, 25),
    "NACIONAL", "ALTO",
    "Alta demanda em festas de fim de ano e confraternizações."));

  festas.push(mkFesta("Réveillon", toISO(ano, 12, 30), toISO(ano, 12, 31),
    "NACIONAL", "ALTÍSSIMO",
    "Segunda maior data do ano para venda de gelo. Prepare estoque 10 dias antes."));

  // Ibotirama
  if (c.includes("IBOTIRAMA")) {
    festas.push(mkFesta("Aniversário de Ibotirama", toISO(ano, 1, 24), toISO(ano, 1, 26),
      "MUNICIPAL", "ALTÍSSIMO",
      "Maior festa municipal da cidade — forró, shows e grande público por 3 dias."));
    festas.push(mkFesta("Micareta de Ibotirama", toISO(ano, 4, 18), toISO(ano, 4, 20),
      "MUNICIPAL", "ALTÍSSIMO",
      "Micareta regional que concentra público de toda a bacia do São Francisco."));
  }

  // Barreiras
  if (c.includes("BARREIRAS")) {
    festas.push(mkFesta("Aniversário de Barreiras", toISO(ano, 7, 21), toISO(ano, 7, 23),
      "MUNICIPAL", "ALTÍSSIMO",
      "Principal festa do município — shows e festas durante toda a semana."));
    festas.push(mkFesta("ExpoBarreiras / AGROBAHIA", toISO(ano, 8, 1), toISO(ano, 8, 5),
      "MUNICIPAL", "ALTO",
      "Feira do agronegócio que movimenta hotéis, restaurantes e bares por 5 dias."));
  }

  // Bom Jesus da Lapa
  if (c.includes("BOM JESUS") || c.includes("LAPA")) {
    festas.push(mkFesta("Romaria de Bom Jesus da Lapa", toISO(ano, 8, 1), toISO(ano, 8, 6),
      "MUNICIPAL", "ALTÍSSIMO",
      "Uma das maiores romarias da Bahia — mais de 1 milhão de visitantes em 6 dias."));
  }

  // Guanambi
  if (c.includes("GUANAMBI")) {
    festas.push(mkFesta("Aniversário de Guanambi", toISO(ano, 10, 2), toISO(ano, 10, 4),
      "MUNICIPAL", "ALTO",
      "Festas e shows na cidade por 3 dias."));
  }

  // Regional BA/PE
  if (u === "BA" || u === "PE") {
    festas.push(mkFesta("Micareta Regional (BA)", toISO(ano, 4, 17), toISO(ano, 4, 20),
      "REGIONAL", "ALTÍSSIMO",
      "Micaretas no interior da Bahia — verificar data exata do município."));
  }

  return festas.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
}

// ─── BUSCA SERPAPI ────────────────────────────────────────────────────────────

async function buscarGoogleEvents(cidade: string, uf: string, serpApiKey: string): Promise<Festa[]> {
  const queries = [
    `festas e eventos em ${cidade} ${uf}`,
    `shows eventos ${cidade}`,
    `agenda cultural ${cidade}`,
  ];

  const mesesEn: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const extrairDataISO = (when: string): string | null => {
    if (!when) return null;
    const ano = new Date().getFullYear();
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

  const encontrados: Festa[] = [];
  const vistos = new Set<string>();

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
          data_inicio: dataISO,
          data_fim: dataISO,
          data: dataISO,
          duracao_dias: 1,
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

// ─── HANDLER ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
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

    const calcDiasAteInicio = (inicio: string): number =>
      Math.floor((new Date(inicio + "T12:00:00").getTime() - hoje.getTime()) / 86400000);

    const urgencia = (d: number): string =>
      d < 0 ? "PASSADO" : d === 0 ? "Hoje!" : d <= 7 ? "Urgente" : d <= 30 ? "Proximo" : "Planeje";

    // 1. Festas fixas
    let fixas = getFestasFixas(cidade, estado, ano);
    if (hoje.getMonth() >= 9) {
      fixas = [...fixas, ...getFestasFixas(cidade, estado, ano + 1)];
    }

    const fixasFiltradas = fixas
      .map((f) => ({
        ...f,
        dias_restantes: calcDiasAteInicio(f.data_inicio),
        urgencia: urgencia(calcDiasAteInicio(f.data_inicio)),
      }))
      .filter((f) => (f.dias_restantes ?? 0) >= 0 && (f.dias_restantes ?? 9999) <= dias_frente);

    // 2. Google Events
    let eventosGoogle: Festa[] = [];
    if (serpApiKey) {
      eventosGoogle = await buscarGoogleEvents(cidade, estado, serpApiKey);
      eventosGoogle = eventosGoogle
        .map((e) => ({
          ...e,
          dias_restantes: calcDiasAteInicio(e.data_inicio),
          urgencia: urgencia(calcDiasAteInicio(e.data_inicio)),
        }))
        .filter((e) => (e.dias_restantes ?? 0) >= 0 && (e.dias_restantes ?? 9999) <= dias_frente);
    }

    // 3. Unifica e ordena
    const impactoOrder: Record<string, number> = { "ALTÍSSIMO": 0, "ALTO": 1, "MEDIO": 2, "BAIXO": 3 };
    const todas = [...fixasFiltradas, ...eventosGoogle].sort(
      (a, b) =>
        (a.data_inicio ?? a.data).localeCompare(b.data_inicio ?? b.data) ||
        (impactoOrder[a.impacto] ?? 3) - (impactoOrder[b.impacto] ?? 3)
    );

    return new Response(
      JSON.stringify({
        cidade, estado,
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
