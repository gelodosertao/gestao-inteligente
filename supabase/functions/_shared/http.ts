const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Vary': 'Origin',
};

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function configuredOrigins(): Set<string> {
  return new Set(
    (Deno.env.get('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function responseHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (origin && configuredOrigins().has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  const origin = req.headers.get('Origin');
  if (!origin || !configuredOrigins().has(origin)) {
    return json(req, 403, { success: false, error: 'Origem não autorizada.' });
  }
  return new Response(null, { status: 204, headers: responseHeaders(req) });
}

export function assertPost(req: Request): void {
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const origin = req.headers.get('Origin');
  if (origin && !configuredOrigins().has(origin)) throw new HttpError(403, 'Origem não autorizada.');
}

export function bearerToken(req: Request): string {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Autenticação obrigatória.');
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new HttpError(401, 'Autenticação obrigatória.');
  return token;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) });
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value;
}
