import { rpc } from './shared.js';

const form = document.getElementById('verify-form');
const input = document.getElementById('code');
const result = document.getElementById('result');
document.getElementById('year').textContent = new Date().getFullYear();

function showResult(kind, title, detail) {
  result.hidden = false;
  result.className = `result ${kind}`;
  result.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = detail;
  result.append(heading, text);
}

const fromUrl = new URLSearchParams(location.search).get('codigo');
if (fromUrl) input.value = fromUrl.slice(0, 32).toUpperCase();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const typed = input.value.trim().toUpperCase();
  const code = /^\d{1,4}$/.test(typed) ? `GS-${typed.padStart(4, '0')}` : typed;
  if (!code) return;
  button.disabled = true;
  showResult('loading', 'Conferindo seu código…', 'Aguarde um instante.');
  try {
    const data = await rpc('gelo_premiado_validate', { p_code: code });
    if (data.status === 'valid') showResult('success', 'Você encontrou um prêmio! ✨', `${data.prize}. Guarde a placa original e apresente o código à nossa equipe para combinar a entrega.`);
    else if (data.status === 'delivered') showResult('warning', 'Prêmio já entregue', 'A entrega deste código já foi registrada. Se houver alguma dúvida, fale com nossa equipe.');
    else showResult('warning', 'Código não encontrado', 'Confira os caracteres impressos na placa e tente novamente.');
  } catch {
    showResult('error', 'Não conseguimos verificar agora', 'Verifique sua conexão e tente novamente em alguns instantes.');
  } finally { button.disabled = false; }
});
