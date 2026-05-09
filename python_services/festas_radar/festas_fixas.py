"""
festas_fixas.py — Calendário fixo de festas com datas de início e fim.
Festas recorrentes que NÃO dependem de API externa: sempre funcionam.
"""

from datetime import date, timedelta


def calcular_pascoa(ano: int) -> date:
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
    """Retorna (sábado de carnaval, terça-feira de carnaval)."""
    pascoa = calcular_pascoa(ano)
    terca_carnaval = pascoa - timedelta(days=47)
    sabado_carnaval = terca_carnaval - timedelta(days=3)
    return sabado_carnaval, terca_carnaval


def festa(nome, inicio, fim, categoria, impacto, dica):
    return {
        "nome": nome,
        "data_inicio": inicio.isoformat(),
        "data_fim": fim.isoformat(),
        "data": fim.isoformat(),          # compatibilidade
        "duracao_dias": (fim - inicio).days + 1,
        "categoria": categoria,
        "impacto": impacto,
        "tipo": "FIXO",
        "dica": dica,
    }


def get_festas_do_ano(ano: int, cidade: str = "", uf: str = "") -> list[dict]:
    cidadeU = cidade.strip().upper()
    ufU = uf.strip().upper()
    result = []

    # ── CARNAVAL (sábado → terça) ────────────────────────────────────────────
    sabado, terca = calcular_carnaval(ano)
    result.append(festa(
        "Carnaval",
        sabado, terca,
        "NACIONAL", "ALTÍSSIMO",
        "Maior pico de consumo de gelo do ano. Estoque máximo 7 dias antes."
    ))

    # ── FESTAS JUNINAS — todo o mês de junho ──────────────────────────────────
    result.append(festa(
        "Temporada Junina",
        date(ano, 6, 1), date(ano, 6, 30),
        "NORDESTE", "ALTÍSSIMO",
        "Todo junho é alta temporada. Prepare estoque máximo desde a última semana de maio."
    ))
    result.append(festa(
        "Festa de Santo Antônio",
        date(ano, 6, 12), date(ano, 6, 13),
        "NORDESTE", "ALTO",
        "Grande movimentação em cidades do interior baiano."
    ))
    result.append(festa(
        "Festa de São João",
        date(ano, 6, 23), date(ano, 6, 24),
        "NORDESTE", "ALTÍSSIMO",
        "Pico máximo das festas juninas. Maior data do Nordeste — prepare dobro do estoque."
    ))
    result.append(festa(
        "Festa de São Pedro",
        date(ano, 6, 28), date(ano, 6, 29),
        "NORDESTE", "ALTO",
        "Encerramento do ciclo junino com festas em todo o interior."
    ))

    # ── NACIONAIS ─────────────────────────────────────────────────────────────
    result.append(festa(
        "Dia dos Namorados",
        date(ano, 6, 12), date(ano, 6, 12),
        "NACIONAL", "ALTO",
        "Alta demanda em bares, restaurantes e delivery de bebidas."
    ))
    result.append(festa(
        "Independência do Brasil",
        date(ano, 9, 7), date(ano, 9, 7),
        "NACIONAL", "MEDIO",
        "Feriado com festas, churrasco e eventos públicos."
    ))
    result.append(festa(
        "Natal",
        date(ano, 12, 24), date(ano, 12, 25),
        "NACIONAL", "ALTO",
        "Alta demanda em festas de fim de ano e confraternizações."
    ))
    result.append(festa(
        "Réveillon",
        date(ano, 12, 30), date(ano, 12, 31),
        "NACIONAL", "ALTÍSSIMO",
        "Segunda maior data do ano para venda de gelo. Prepare estoque 10 dias antes."
    ))

    # ── IBOTIRAMA ─────────────────────────────────────────────────────────────
    if "IBOTIRAMA" in cidadeU:
        result.append(festa(
            "Aniversário de Ibotirama",
            date(ano, 1, 24), date(ano, 1, 26),
            "MUNICIPAL", "ALTÍSSIMO",
            "Maior festa municipal da cidade — forró, shows e grande público por 3 dias."
        ))
        result.append(festa(
            "Micareta de Ibotirama",
            date(ano, 4, 18), date(ano, 4, 20),
            "MUNICIPAL", "ALTÍSSIMO",
            "Micareta regional que concentra público de toda a bacia do São Francisco."
        ))

    # ── BARREIRAS ─────────────────────────────────────────────────────────────
    if "BARREIRAS" in cidadeU:
        result.append(festa(
            "Aniversário de Barreiras",
            date(ano, 7, 21), date(ano, 7, 23),
            "MUNICIPAL", "ALTÍSSIMO",
            "Principal festa do município — shows e festas durante toda a semana."
        ))
        result.append(festa(
            "ExpoBarreiras / AGROBAHIA",
            date(ano, 8, 1), date(ano, 8, 5),
            "MUNICIPAL", "ALTO",
            "Feira do agronegócio que movimenta hotéis, restaurantes e bares por 5 dias."
        ))

    # ── BOM JESUS DA LAPA ─────────────────────────────────────────────────────
    if "BOM JESUS" in cidadeU or "LAPA" in cidadeU:
        result.append(festa(
            "Romaria de Bom Jesus da Lapa",
            date(ano, 8, 1), date(ano, 8, 6),
            "MUNICIPAL", "ALTÍSSIMO",
            "Uma das maiores romarias da Bahia — mais de 1 milhão de visitantes em 6 dias."
        ))

    # ── GUANAMBI ──────────────────────────────────────────────────────────────
    if "GUANAMBI" in cidadeU:
        result.append(festa(
            "Aniversário de Guanambi",
            date(ano, 10, 2), date(ano, 10, 4),
            "MUNICIPAL", "ALTO",
            "Festas e shows na cidade por 3 dias."
        ))

    # ── REGIONAL BA/PE ────────────────────────────────────────────────────────
    if ufU in ("BA", "PE"):
        result.append(festa(
            "Micareta Regional (BA)",
            date(ano, 4, 17), date(ano, 4, 20),
            "REGIONAL", "ALTÍSSIMO",
            "Micaretas no interior da Bahia — verificar data exata do município."
        ))

    return sorted(result, key=lambda x: x["data_inicio"])
