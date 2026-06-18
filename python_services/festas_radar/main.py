"""
main.py — Microserviço Python: Caçador de Festas
Busca eventos por cidade + UF via SerpAPI (Google Events) + calendário fixo interno.

Uso:
    python main.py --cidade "Ibotirama" --uf "BA"
    python main.py --cidade "Barreiras" --uf "BA" --dias 90
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta
import requests
from festas_fixas import get_festas_do_ano

# ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
from config import SERPAPI_KEY
SERPAPI_URL = "https://serpapi.com/search.json"

IMPACTO_ORDER = {"ALTÍSSIMO": 0, "ALTO": 1, "MEDIO": 2, "BAIXO": 3}

# ─── BUSCA NA SERPAPI ─────────────────────────────────────────────────────────

def buscar_eventos_google(cidade: str, uf: str, dias_frente: int = 60) -> list[dict]:
    """
    Chama a SerpAPI com o motor google_events para buscar eventos reais.
    """
    queries = [
        f"festas e eventos em {cidade} {uf}",
        f"shows e eventos {cidade}",
        f"agenda cultural {cidade} {uf}",
    ]

    eventos_encontrados = []
    ids_vistos = set()

    for query in queries:
        params = {
            "engine": "google_events",
            "q": query,
            "api_key": SERPAPI_KEY,
            "hl": "pt",
            "gl": "br",
            "location": f"{cidade}, {uf}, Brazil",
        }

        try:
            resp = requests.get(SERPAPI_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            for evento in data.get("events_results", []):
                title = evento.get("title", "")
                date_info = evento.get("date", {})
                when_str = date_info.get("when", "")
                address = evento.get("address", [])

                if not title or title in ids_vistos:
                    continue
                ids_vistos.add(title)

                # Tenta extrair a data ISO do evento
                data_iso = extrair_data_iso(when_str)
                if not data_iso:
                    continue

                # Filtra eventos dentro do intervalo solicitado
                evento_date = date.fromisoformat(data_iso)
                hoje = date.today()
                if evento_date < hoje or evento_date > (hoje + timedelta(days=dias_frente)):
                    continue

                dias_restantes = (evento_date - hoje).days
                eventos_encontrados.append({
                    "nome": title,
                    "data": data_iso,
                    "when_original": when_str,
                    "endereco": ", ".join(address) if isinstance(address, list) else str(address),
                    "categoria": "GOOGLE",
                    "impacto": classificar_impacto(title, dias_restantes),
                    "tipo": "GOOGLE",
                    "dica": "Evento encontrado via Google Events. Confirme com o organizador.",
                    "thumbnail": evento.get("thumbnail", ""),
                })

        except requests.RequestException as e:
            print(f"⚠️  Erro ao consultar SerpAPI (query='{query}'): {e}", file=sys.stderr)

    return eventos_encontrados


def extrair_data_iso(when_str: str) -> str | None:
    """
    Tenta extrair uma data ISO (YYYY-MM-DD) de strings como:
    'Sat, Jun 21' / 'June 21' / '21 de junho de 2026'
    """
    if not when_str:
        return None

    ano_atual = date.today().year
    meses_pt = {
        "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4,
        "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
        "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
    }
    meses_en = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10,
        "november": 11, "december": 12,
    }

    lower = when_str.lower().strip()

    # Tenta formatos comuns
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y"]:
        try:
            return datetime.strptime(when_str.strip(), fmt).date().isoformat()
        except ValueError:
            pass

    # Formato: "Sat, Jun 21" → usa ano atual ou próximo
    parts = lower.replace(",", "").split()
    for mes_str, mes_num in {**meses_en, **meses_pt}.items():
        if mes_str in parts:
            idx = parts.index(mes_str)
            if idx + 1 < len(parts):
                try:
                    dia = int(parts[idx + 1])
                    d = date(ano_atual, mes_num, dia)
                    if d < date.today():
                        d = date(ano_atual + 1, mes_num, dia)
                    return d.isoformat()
                except (ValueError, OverflowError):
                    pass

    return None


def classificar_impacto(titulo: str, dias: int) -> str:
    """Classifica o impacto do evento baseado em palavras-chave e proximidade."""
    titulo_lower = titulo.lower()
    keywords_alto = ["carnaval", "micareta", "são joão", "forró", "réveillon", "festival", "show"]
    keywords_medio = ["feira", "festa", "evento", "aniversário", "exposição"]

    if any(k in titulo_lower for k in keywords_alto):
        return "ALTÍSSIMO"
    if any(k in titulo_lower for k in keywords_medio):
        return "ALTO"
    if dias <= 7:
        return "ALTO"
    if dias <= 30:
        return "MEDIO"
    return "BAIXO"


# ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────

def calcular_dias_restantes(data_iso: str) -> int:
    try:
        evento_date = date.fromisoformat(data_iso)
        return (evento_date - date.today()).days
    except Exception:
        return 9999


def calcular_urgencia(dias: int) -> str:
    if dias < 0:
        return "PASSADO"
    if dias <= 7:
        return "🔴 URGENTE"
    if dias <= 30:
        return "🟡 PRÓXIMO"
    return "🟢 PLANEJE"


def buscar_festas(cidade: str, uf: str, dias_frente: int = 90) -> dict:
    """Função principal: combina festas fixas + SerpAPI."""
    hoje = date.today()
    ano = hoje.year

    print(f"\n🎯 Caçando festas em: {cidade.title()} - {uf.upper()}")
    print(f"📅 Janela: próximos {dias_frente} dias")
    print("─" * 50)

    # 1. Festas fixas do calendário interno
    todas_fixas = get_festas_do_ano(ano, cidade, uf)
    # Se estiver perto do final do ano, inclui festas do próximo também
    if hoje.month >= 10:
        todas_fixas += get_festas_do_ano(ano + 1, cidade, uf)

    # Filtra pelo intervalo de dias
    festas_fixas_filtradas = []
    for f in todas_fixas:
        dias = calcular_dias_restantes(f["data"])
        if 0 <= dias <= dias_frente:
            f["dias_restantes"] = dias
            f["urgencia"] = calcular_urgencia(dias)
            festas_fixas_filtradas.append(f)

    print(f"📚 Calendário fixo: {len(festas_fixas_filtradas)} festas encontradas")

    # 2. SerpAPI — busca Google Events
    eventos_google = []
    if SERPAPI_KEY and SERPAPI_KEY != "SUA_CHAVE_AQUI":
        print("🌐 Consultando Google Events via SerpAPI...")
        eventos_google = buscar_eventos_google(cidade, uf, dias_frente)
        for e in eventos_google:
            e["dias_restantes"] = calcular_dias_restantes(e["data"])
            e["urgencia"] = calcular_urgencia(e["dias_restantes"])
        print(f"✅ Google Events: {len(eventos_google)} eventos encontrados")
    else:
        print("⚠️  Chave SerpAPI não configurada. Operando apenas com calendário fixo.")

    # 3. Unifica e ordena
    todas = festas_fixas_filtradas + eventos_google
    todas.sort(key=lambda x: (x["data"], IMPACTO_ORDER.get(x.get("impacto", "BAIXO"), 3)))

    resultado = {
        "cidade": cidade.title(),
        "uf": uf.upper(),
        "consultado_em": hoje.isoformat(),
        "janela_dias": dias_frente,
        "total_eventos": len(todas),
        "festas": todas
    }

    return resultado


def imprimir_resultado(resultado: dict):
    """Exibe o resultado de forma legível no terminal."""
    print(f"\n{'═' * 55}")
    print(f"  🎉 FESTAS EM {resultado['cidade']} - {resultado['uf']}")
    print(f"{'═' * 55}")
    print(f"  Total: {resultado['total_eventos']} eventos nos próximos {resultado['janela_dias']} dias")
    print(f"{'─' * 55}\n")

    if not resultado["festas"]:
        print("  Nenhuma festa encontrada no período. Calendário está livre!")
        return

    for festa in resultado["festas"]:
        dias = festa.get("dias_restantes", "?")
        urgencia = festa.get("urgencia", "")
        tipo_badge = "📌 FIXO" if festa["tipo"] == "FIXO" else "🌐 GOOGLE"

        print(f"  {urgencia}  {festa['nome']}")
        print(f"  📅 {festa['data']}  ({dias} dias)  [{tipo_badge}] [{festa.get('impacto','?')}]")
        if festa.get("endereco"):
            print(f"  📍 {festa['endereco']}")
        if festa.get("dica"):
            print(f"  💡 {festa['dica']}")
        print()


# ─── ENTRY POINT ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Caçador de Festas — G.AI Gelo do Sertão")
    parser.add_argument("--cidade", required=True, help="Nome da cidade")
    parser.add_argument("--uf", required=True, help="Sigla do estado (ex: BA, PE, CE)")
    parser.add_argument("--dias", type=int, default=90, help="Janela de dias à frente (padrão: 90)")
    parser.add_argument("--json", action="store_true", help="Saída em JSON bruto")

    args = parser.parse_args()

    resultado = buscar_festas(args.cidade, args.uf, args.dias)

    if args.json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        imprimir_resultado(resultado)
