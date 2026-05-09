# 🎉 Caçador de Festas — Guia de Deploy

## 1. Deploy da Edge Function (Supabase Dashboard)

### Passo 1 — Configurar o Secret da SerpAPI
1. Acesse [app.supabase.com](https://app.supabase.com) → seu projeto
2. Vá em **Settings → Edge Functions → Secrets**
3. Adicione: `SERPAPI_KEY` = (sua chave da SerpAPI)

### Passo 2 — Deploy via CLI (após `supabase login`)
```bash
# Autenticar
npx supabase login

# Configurar o projeto (use o Reference ID do seu projeto)
npx supabase link --project-ref SEU_PROJECT_REF

# Deploy da Edge Function
npx supabase functions deploy buscar-festas --no-verify-jwt
```

### Alternativa — Deploy via Supabase Dashboard
1. Acesse **Edge Functions** no dashboard
2. Clique em **New Function** → nome: `buscar-festas`
3. Cole o conteúdo de `supabase/functions/buscar-festas/index.ts`
4. Clique em **Deploy**

---

## 2. Microserviço Python (Uso Local)

### Instalação
```bash
cd python_services/festas_radar
pip install -r requirements.txt
```

### Uso
```bash
# Busca básica
python main.py --cidade "Ibotirama" --uf "BA"

# Janela personalizada de 60 dias
python main.py --cidade "Barreiras" --uf "BA" --dias 60

# Saída JSON (para integrar com outros sistemas)
python main.py --cidade "Ibotirama" --uf "BA" --json
```

### Configurar chave SerpAPI (opcional para Python)
```bash
# Windows PowerShell
$env:SERPAPI_KEY="sua_chave_aqui"
python main.py --cidade "Ibotirama" --uf "BA"
```

---

## 3. Festas Pré-cadastradas (Calendário Fixo)

As seguintes festas já estão no sistema e **não precisam de API**:

| Festa | Data |
|---|---|
| 🎭 Carnaval | Calculado automaticamente (varia por ano) |
| 🌽 São João | 24 de junho |
| 🎇 Santo Antônio | 13 de junho |
| 🎆 Réveillon | 31 de dezembro |
| 🎅 Natal | 25 de dezembro |
| 🏛️ Aniversário de Ibotirama | 26 de janeiro |
| 🏛️ Aniversário de Barreiras | 23 de julho |
| ✝️ Romaria de Bom Jesus da Lapa | 6 de agosto |

Para adicionar mais festas municipais, edite `festas_fixas.py` (Python) ou a função `getFestasFixas()` na Edge Function.
