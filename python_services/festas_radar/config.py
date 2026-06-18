import os
from dotenv import load_dotenv

load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

if not SERPAPI_KEY:
    raise ValueError(
        "SERPAPI_KEY não configurada. "
        "Crie um arquivo .env na pasta python_services/festas_radar/ "
        "com SERPAPI_KEY=SUA_CHAVE"
    )
