"""
festas_fixas.py — Calendário fixo de festas de alto impacto para venda de gelo.
Festas recorrentes que NÃO dependem de API externa: sempre funcionam.
"""

from datetime import date, timedelta
import math

def calcular_pascoa(ano: int) -> date:
    """Algoritmo de Butcher para calcular a data da Páscoa."""
    a = ano % 19
    b = ano // 100
    c = ano % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)

def calcular_carnaval(ano: int) -> tuple[date, date]:
    """Retorna (sábado de carnaval, quarta-feira de cinzas)."""
    pascoa = calcular_pascoa(ano)
    quarta_cinzas = pascoa - timedelta(days=46)
    sabado_carnaval = quarta_cinzas - timedelta(days=4)
    return sabado_carnaval, quarta_cinzas

def get_festas_do_ano(ano: int, cidade: str = "", uf: str = "") -> list[dict]:
    """
    Retorna lista de festas fixas relevantes para o negócio de gelo.
    cidade e uf são usados para incluir festas municipais específicas.
    """
    festas = []
    cidade_upper = cidade.strip().upper()
    uf_upper = uf.strip().upper()

    # ─── FESTAS NACIONAIS ────────────────────────────────────────────────────
    sabado_carnaval, quarta_cinzas = calcular_carnaval(ano)
    festas += [
        {
            "nome": "🎭 Carnaval — Início (Sábado)",
            "data": sabado_carnaval.isoformat(),
            "categoria": "NACIONAL",
            "impacto": "ALTÍSSIMO",
            "tipo": "FIXO",
            "dica": "Maior pico de consumo de gelo do ano. Estoque máximo 7 dias antes.",
        },
        {
            "nome": "🎭 Carnaval — Encerramento (Quarta de Cinzas)",
            "data": quarta_cinzas.isoformat(),
            "categoria": "NACIONAL",
            "impacto": "ALTÍSSIMO",
            "tipo": "FIXO",
            "dica": "Pico se mantém até o final. Repor estoque segunda-feira.",
        },
        {
            "nome": "🎅 Natal",
            "data": date(ano, 12, 25).isoformat(),
            "categoria": "NACIONAL",
            "impacto": "ALTO",
            "tipo": "FIXO",
            "dica": "Alta demanda em festas de fim de ano e confraternizações.",
        },
        {
            "nome": "🎆 Réveillon",
            "data": date(ano, 12, 31).isoformat(),
            "categoria": "NACIONAL",
            "impacto": "ALTÍSSIMO",
            "tipo": "FIXO",
            "dica": "Segunda maior data do ano. Preparar estoque 10 dias antes.",
        },
        {
            "nome": "💝 Dia dos Namorados",
            "data": date(ano, 6, 12).isoformat(),
            "categoria": "NACIONAL",
            "impacto": "ALTO",
            "tipo": "FIXO",
            "dica": "Alta demanda em bares, restaurantes e delivery de bebidas.",
        },
        {
            "nome": "🍺 Dia das Mães (véspera)",
            "data": date(ano, 5, 10).isoformat(),  # Segundo domingo de maio (aprox)
            "categoria": "NACIONAL",
            "impacto": "MEDIO",
            "tipo": "FIXO",
            "dica": "Almoços em família aumentam consumo de bebidas e gelo.",
        },
        {
            "nome": "🍺 Dia dos Pais (véspera)",
            "data": date(ano, 8, 9).isoformat(),  # Segundo domingo de agosto (aprox)
            "categoria": "NACIONAL",
            "impacto": "MEDIO",
            "tipo": "FIXO",
            "dica": "Mesmo perfil do Dia das Mães.",
        },
        {
            "nome": "🇧🇷 7 de Setembro — Independência",
            "data": date(ano, 9, 7).isoformat(),
            "categoria": "NACIONAL",
            "impacto": "MEDIO",
            "tipo": "FIXO",
            "dica": "Feriado com festas, eventos e churrasco.",
        },
    ]

    # ─── FESTAS JUNINAS (NORDESTE) ────────────────────────────────────────────
    festas += [
        {
            "nome": "🌽 Início da Temporada Junina",
            "data": date(ano, 6, 1).isoformat(),
            "categoria": "NORDESTE",
            "impacto": "ALTÍSSIMO",
            "tipo": "FIXO",
            "dica": "Todo junho é alta temporada. Preparar estoque máximo desde maio.",
        },
        {
            "nome": "🎇 Festa de Santo Antônio",
            "data": date(ano, 6, 13).isoformat(),
            "categoria": "NORDESTE",
            "impacto": "ALTO",
            "tipo": "FIXO",
            "dica": "Grande movimentação em cidades do interior.",
        },
        {
            "nome": "🎆 Festa de São João",
            "data": date(ano, 6, 24).isoformat(),
            "categoria": "NORDESTE",
            "impacto": "ALTÍSSIMO",
            "tipo": "FIXO",
            "dica": "Pico máximo das festas juninas. Maior data do Nordeste.",
        },
        {
            "nome": "🎇 Festa de São Pedro",
            "data": date(ano, 6, 29).isoformat(),
            "categoria": "NORDESTE",
            "impacto": "ALTO",
            "tipo": "FIXO",
            "dica": "Encerramento do ciclo junino com festas.",
        },
        {
            "nome": "🌽 Encerramento da Temporada Junina",
            "data": date(ano, 6, 30).isoformat(),
            "categoria": "NORDESTE",
            "impacto": "ALTO",
            "tipo": "FIXO",
            "dica": "Último dia de junho ainda com alta demanda.",
        },
    ]

    # ─── FESTAS MUNICIPAIS: IBOTIRAMA ────────────────────────────────────────
    if "IBOTIRAMA" in cidade_upper or uf_upper == "BA":
        festas += [
            {
                "nome": "🏛️ Aniversário de Ibotirama",
                "data": date(ano, 1, 26).isoformat(),
                "categoria": "MUNICIPAL",
                "impacto": "ALTÍSSIMO",
                "tipo": "FIXO",
                "dica": "Maior festa municipal da cidade. Forró, shows e multidão.",
            },
            {
                "nome": "🎠 Feira Agropecuária de Ibotirama",
                "data": date(ano, 9, 15).isoformat(),  # Aproximado — confirmar
                "categoria": "MUNICIPAL",
                "impacto": "ALTO",
                "tipo": "FIXO",
                "dica": "Evento regional que atrai público das cidades vizinhas.",
            },
        ]

    # ─── FESTAS MUNICIPAIS: BARREIRAS ────────────────────────────────────────
    if "BARREIRAS" in cidade_upper or uf_upper == "BA":
        festas += [
            {
                "nome": "🏛️ Aniversário de Barreiras",
                "data": date(ano, 7, 23).isoformat(),
                "categoria": "MUNICIPAL",
                "impacto": "ALTÍSSIMO",
                "tipo": "FIXO",
                "dica": "Principal festa do município. Shows e festas durante a semana.",
            },
            {
                "nome": "🌾 AGROBAHIA (Feira do Agronegócio)",
                "data": date(ano, 8, 1).isoformat(),  # Aproximado — confirmar
                "categoria": "MUNICIPAL",
                "impacto": "ALTO",
                "tipo": "FIXO",
                "dica": "Evento de agronegócio que movimenta hotéis e restaurantes.",
            },
        ]

    # ─── FESTAS REGIONAIS: VALE DO SÃO FRANCISCO ─────────────────────────────
    if uf_upper == "BA" or uf_upper == "PE":
        festas += [
            {
                "nome": "🐟 Festa do Pescado (Rio São Francisco)",
                "data": date(ano, 3, 15).isoformat(),  # Aproximado
                "categoria": "REGIONAL",
                "impacto": "MEDIO",
                "tipo": "FIXO",
                "dica": "Eventos às margens do São Francisco com alto consumo.",
            },
            {
                "nome": "🎵 Micareta Regional (BA)",
                "data": date(ano, 4, 20).isoformat(),  # Aproximado — varia por cidade
                "categoria": "REGIONAL",
                "impacto": "ALTÍSSIMO",
                "tipo": "FIXO",
                "dica": "Micaretas no interior da Bahia. Verificar data exata do município.",
            },
        ]

    return sorted(festas, key=lambda x: x["data"])
