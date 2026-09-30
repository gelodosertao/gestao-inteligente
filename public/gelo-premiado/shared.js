const config = window.GELO_PREMIADO_CONFIG;

export function configurationReady() {
  return Boolean(config?.supabaseUrl && config?.anonKey);
}

export async function request(path, body, token) {
  if (!configurationReady()) throw new Error('A campanha ainda não foi configurada.');
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token || config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.msg || 'Não foi possível concluir a operação.');
  return data;
}

export function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, body, token);
}
