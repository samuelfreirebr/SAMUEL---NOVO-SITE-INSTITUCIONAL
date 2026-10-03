/* ============================================================
   Painel de formulários: todos os briefings num lugar só.

   Cada formulário nasce em branco ou ligado a uma proposta (que traz
   o cliente e a transcrição da reunião). Daqui sai para editar as
   perguntas, ler as respostas, copiar o link ou apagar.
   ============================================================ */

import { h } from '../propostas/ui.js';
import { ico } from '../icones.js';

const $ = (s, r = document) => r.querySelector(s);

let formularios = [];
let propostas = [];

async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  if (r.status === 401) { location.replace('/admin/entrar?voltar=/admin/formularios/'); throw new Error('Faça login.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado.');
  return d;
}

let timer;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = txt; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('mostra'), 3500);
}

const data = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/* ---------- lista ---------- */
async function carregar() {
  try {
    [{ formularios }, { propostas }] = await Promise.all([api('/api/formularios'), api('/api/propostas')]);
  } catch (e) { $('#lista').textContent = e.message; return; }
  pintar();
}

function estadoDe(f) {
  if (f.total) return [f.total > 1 ? 'Respondido ×' + f.total : 'Respondido', 'ok'];
  if (f.parciais) return ['Parcial', 'parcial'];
  return ['Aguardando', 'espera'];
}

function pintar() {
  const lista = $('#lista');
  lista.innerHTML = '';
  if (!formularios.length) {
    lista.append(h('div', { class: 'fm-vazio' },
      h('p', { class: 'fm-vazio__t' }, 'Nenhum formulário ainda.'),
      h('p', {}, 'Crie o primeiro: em branco, ou a partir de uma proposta para a IA ler a reunião.'),
      h('button', { type: 'button', class: 'btn btn--brand btn--peq', onclick: abrirCriar }, ico('mais'), 'Criar formulário')));
    return;
  }
  for (const f of formularios) lista.append(cartao(f));
}

function cartao(f) {
  const [rotulo, tom] = estadoDe(f);
  const url = location.origin + '/perguntas/' + f.link;
  const nome = f.cliente || f.titulo || f.id;
  return h('article', { class: 'fm-card' },
    h('div', { class: 'fm-card__topo' },
      h('span', { class: 'fm-selo fm-selo--' + tom }, rotulo),
      h('span', { class: 'fm-card__tipo' }, f.proposta ? 'Ligado à proposta' : 'Em branco')),
    h('a', { class: 'fm-card__nome', href: '/admin/perguntas/#' + encodeURIComponent(f.id) }, nome),
    h('p', { class: 'fm-card__meta' }, f.perguntas + (f.perguntas === 1 ? ' pergunta' : ' perguntas') + ' · atualizado em ' + data(f.atualizadoEm)),
    h('div', { class: 'fm-card__acoes' },
      h('a', { class: 'mini mini--ativo', href: '/admin/perguntas/#' + encodeURIComponent(f.id) }, ico('editar'), 'Editar'),
      h('a', { class: 'mini', href: '/admin/perguntas/#' + encodeURIComponent(f.id) + '/respostas' }, ico('respostas'), 'Respostas', f.total + f.parciais ? h('span', { class: 'fm-n' }, String(f.total + f.parciais)) : null),
      h('button', { type: 'button', class: 'mini', onclick: async () => { try { await navigator.clipboard.writeText(url); avisar('Link copiado.'); } catch (e) { avisar(url); } } }, ico('elo'), 'Link'),
      h('a', { class: 'mini', href: url, target: '_blank', rel: 'noopener' }, ico('olho'), 'Ver'),
      h('button', { type: 'button', class: 'mini mini--perigo fm-card__apagar', onclick: () => apagar(f), 'aria-label': 'Apagar formulário' }, ico('apagar'))));
}

async function apagar(f) {
  const qtd = f.total + f.parciais;
  if (!confirm('Apagar o formulário de "' + (f.cliente || f.titulo || f.id) + '"?' + (qtd ? '\n\nAs ' + qtd + ' respostas e os arquivos enviados também saem. Não dá para desfazer.' : ''))) return;
  try {
    await api('/api/formularios/' + encodeURIComponent(f.id), { method: 'DELETE' });
    formularios = formularios.filter((x) => x.id !== f.id);
    pintar();
    avisar('Formulário apagado.');
  } catch (e) { avisar(e.message, 'erro'); }
}

/* ---------- criar ---------- */
function origem() { return document.querySelector('input[name="origem"]:checked').value; }

function abrirCriar() {
  $('#criar-aviso').hidden = true;
  $('#nome').value = '';
  const sel = $('#proposta');
  sel.innerHTML = '';
  const com = new Set(formularios.map((f) => f.id));
  for (const p of propostas) {
    sel.append(h('option', { value: p.id }, (p.cliente || p.id) + (com.has(p.id) ? ' (já tem formulário)' : '')));
  }
  document.querySelector('input[name="origem"][value="branco"]').checked = true;
  atualizarCampos();
  $('#criar').showModal();
}

function atualizarCampos() {
  const porProposta = origem() === 'proposta';
  $('#campo-proposta').hidden = !porProposta;
  $('#campo-nome').hidden = porProposta;
  $('#criar-ok').disabled = porProposta && !propostas.length;
  if (porProposta && !propostas.length) {
    $('#criar-aviso').textContent = 'Você ainda não tem propostas. Crie uma em Propostas ou comece em branco.';
    $('#criar-aviso').hidden = false;
  } else $('#criar-aviso').hidden = true;
}

async function criar() {
  const b = $('#criar-ok');
  b.disabled = true;
  try {
    const corpo = origem() === 'proposta' ? { proposta: $('#proposta').value } : { titulo: $('#nome').value };
    const d = await api('/api/formularios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    location.href = '/admin/perguntas/#' + encodeURIComponent(d.id);
  } catch (e) {
    $('#criar-aviso').textContent = e.message; $('#criar-aviso').hidden = false;
    b.disabled = false;
  }
}

/* ---------- ligações ---------- */
$('#novo').append(ico('mais'), 'Novo formulário');
$('#novo').onclick = abrirCriar;
$('#criar-fechar').onclick = () => $('#criar').close();
$('#criar-ok').onclick = criar;
for (const r of document.querySelectorAll('input[name="origem"]')) r.onchange = atualizarCampos;
$('#criar').addEventListener('click', (e) => { if (e.target === $('#criar')) $('#criar').close(); });
carregar();
