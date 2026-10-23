import { request, rpc } from './shared.js';

const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('gelo-premiado-token');
let rows = [];
let lastCreated = [];
let pendingDelivery = null;

function message(id, text) { $(id).textContent = text; }
function showDashboard(visible) {
  $('login-view').hidden = visible;
  $('dashboard').hidden = !visible;
  $('logout').hidden = !visible;
}
function logout() {
  token = null;
  sessionStorage.removeItem('gelo-premiado-token');
  showDashboard(false);
  message('login-message', '');
}
function formatDate(value) { return new Date(value).toLocaleString('pt-BR'); }
function downloadCsv(records) {
  const csvCell = (value) => {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const csv = ['codigo;participante;premio', ...records.map((record) => [record.code, record.participant, record.prize].map(csvCell).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `gelo-premiado-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function cell(text) { const node = document.createElement('td'); node.textContent = String(text ?? ''); return node; }
function updateParticipantOptions() {
  const filter = $('participant-filter');
  const selected = filter.value;
  const names = [...new Set(rows.map((row) => row.participant_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  filter.replaceChildren(new Option('Todos os participantes', ''));
  $('participant-suggestions').replaceChildren();
  for (const name of names) {
    filter.add(new Option(name, name));
    $('participant-suggestions').append(new Option(name, name));
  }
  filter.value = names.includes(selected) ? selected : '';
}
function render() {
  const participant = $('participant-filter').value;
  const status = $('status-filter').value;
  const visible = rows.filter((row) =>
    (!participant || row.participant_name === participant) &&
    (!status || (status === 'delivered' ? Boolean(row.delivered_at) : !row.delivered_at))
  );
  const body = $('codes-body'); body.replaceChildren();
  for (const row of visible) {
    const tr = document.createElement('tr');
    tr.append(cell(row.code), cell(row.participant_name || 'Não informado'), cell(row.prize), cell(row.delivered_at ? 'Entregue' : 'Aguardando'), cell(formatDate(row.created_at)));
    const action = cell('');
    if (!row.delivered_at) {
      const button = document.createElement('button');
      button.className = 'table-button'; button.textContent = 'Registrar entrega';
      button.addEventListener('click', () => { pendingDelivery = row; $('deliver-description').textContent = `${row.code} · ${row.participant_name || 'Participante não informado'} · ${row.prize}`; message('deliver-message', ''); $('delivery-note').value = ''; $('plaque-confirmed').checked = false; $('deliver-dialog').showModal(); });
      action.append(button);
    } else { action.textContent = row.delivery_note || 'Entregue'; }
    tr.append(action); body.append(tr);
  }
  message('list-message', rows.length ? (visible.length ? '' : 'Nenhum código corresponde aos filtros.') : 'Nenhum código gerado ainda.');
}
async function loadCodes() {
  message('list-message', 'Carregando códigos…');
  try {
    const [list, summary] = await Promise.all([
      rpc('gelo_premiado_list', {}, token),
      rpc('gelo_premiado_summary', {}, token),
    ]);
    rows = list;
    updateParticipantOptions();
    $('total-count').textContent = summary.total;
    $('pending-count').textContent = summary.pending;
    $('delivered-count').textContent = summary.delivered;
    render();
  }
  catch (error) { message('list-message', error.message); if (/jwt|token|autentica/i.test(error.message)) logout(); }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  message('login-message', 'Entrando…');
  try {
    const data = await request('/auth/v1/token?grant_type=password', { email: $('email').value.trim(), password: $('password').value });
    token = data.access_token;
    await rpc('gelo_premiado_admin_tenant', {}, token);
    sessionStorage.setItem('gelo-premiado-token', token);
    $('password').value = '';
    showDashboard(true);
    await loadCodes();
  } catch { token = null; message('login-message', 'Não foi possível entrar. Confira suas credenciais e permissões de administrador.'); }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', logout);
$('refresh').addEventListener('click', loadCodes);
$('participant-filter').addEventListener('change', render);
$('status-filter').addEventListener('change', render);
$('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  lastCreated = [];
  $('download-new').hidden = true;
  message('create-message', 'Gerando códigos…');
  try {
    const prize = $('prize').value.trim();
    const participant = $('participant').value.trim();
    const codes = await rpc('gelo_premiado_create', { p_prize: prize, p_quantity: Number($('quantity').value), p_participant_name: participant }, token);
    lastCreated = codes.map((code) => ({ code, participant, prize }));
    message('create-message', `${lastCreated.length} código(s) gerado(s). Baixe o CSV antes de sair desta página.`);
    $('download-new').hidden = false;
    await loadCodes();
  } catch (error) { message('create-message', error.message); }
  finally { button.disabled = false; }
});
$('download-new').addEventListener('click', () => downloadCsv(lastCreated));
$('cancel-delivery').addEventListener('click', () => $('deliver-dialog').close());
$('deliver-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingDelivery) return;
  const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const result = await rpc('gelo_premiado_deliver', { p_id: pendingDelivery.id, p_note: $('delivery-note').value.trim() }, token);
    if (result.status !== 'delivered') throw new Error('A entrega já foi registrada.');
    $('deliver-dialog').close(); pendingDelivery = null; await loadCodes();
  } catch (error) { message('deliver-message', error.message); }
  finally { button.disabled = false; }
});

if (token) { showDashboard(true); loadCodes(); } else showDashboard(false);
