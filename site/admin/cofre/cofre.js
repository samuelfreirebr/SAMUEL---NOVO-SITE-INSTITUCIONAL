/* ============================================================
   Cofre: links úteis e anotações num lugar só.

   A lista inteira vem de uma vez e a busca e os filtros rodam
   aqui, no navegador. A barra do topo faz as duas coisas: colou um
   link, ele é guardado na hora e a IA organiza em seguida; digitou
   texto, ela busca. ?link= na entrada guarda direto (vem do campo
   da tela inicial do painel e do favorito "Guardar no Cofre").
   ============================================================ */

import { h } from '../propostas/ui.js';
import { ico } from '../icones.js';

const $ = (s, r = document) => r.querySelector(s);

const CATEGORIAS = {
  ferramentas: 'Ferramentas',
  github: 'GitHub',
  videos: 'Vídeos',
  ia: 'Claude e IA',
  docs: 'Documentação',
  arquivos: 'Arquivos',
  outros: 'Outros',
};

let itens = [];
let iaLigada = false;
let filtro = 'todos';     // 'todos', 'fixados' ou uma categoria
let tag = '';
let editando = null;      // item aberto no formulário (null = novo)
let categoriaTocada = false;

async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  if (r.status === 401) { location.replace('/admin/entrar?voltar=/admin/cofre/'); throw new Error('Faça login.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado.');
  return d;
}
const enviar = (url, metodo, corpo) => api(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

let timer;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = txt; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('mostra'), 3500);
}

const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Categoria pelo endereço, na hora de colar. A IA confirma ou corrige
   logo depois. Ordem importa: docs.google.com é arquivo, docs.github.com
   é documentação, github.com é repositório. */
const PISTAS = [
  [/(^|\.)(drive\.google\.com|docs\.google\.com|sheets\.google\.com|slides\.google\.com|figma\.com|notion\.so|notion\.site|dropbox\.com|miro\.com|onedrive\.live\.com)/, 'arquivos'],
  [/^(docs|developer|developers|devdocs|learn)\.|readthedocs|developer\.mozilla\.org|\/docs?(\/|$)|\/documentation/, 'docs'],
  [/(^|\.)(github\.com|gitlab\.com|githubusercontent\.com|bitbucket\.org)/, 'github'],
  [/(^|\.)(instagram\.com|youtube\.com|youtu\.be|tiktok\.com|vimeo\.com|loom\.com|twitch\.tv)/, 'videos'],
  [/(^|\.)(claude\.ai|claude\.com|anthropic\.com|openai\.com|chatgpt\.com|huggingface\.co|skills\.sh|perplexity\.ai|gemini\.google\.com|aistudio\.google\.com|replicate\.com|mistral\.ai|deepseek\.com|smithery\.ai|mcp\.so)/, 'ia'],
];
function categoriaDoLink(url) {
  const d = dominio(url);
  if (!d) return null;
  const alvo = d + new URL(url).pathname;
  for (const [re, cat] of PISTAS) if (re.test(alvo)) return cat;
  return 'ferramentas';
}

/* ---------- guardar rápido ---------- */
const ehLink = (t) => /^(https?:\/\/)?[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(String(t || '').trim());
const comHttps = (t) => /^https?:\/\//i.test(t) ? t : 'https://' + t;

function destacar(id) {
  const el = document.querySelector('[data-id="' + id + '"]');
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('cf-card--destaque');
  setTimeout(() => el.classList.remove('cf-card--destaque'), 2500);
}

// Guarda já com o domínio e a categoria do endereço; a página (e a IA,
// se ligada) completa nome, descrição, categoria e tags em seguida.
async function guardarRapido(bruto) {
  const url = comHttps(String(bruto).trim());
  $('#busca').value = '';
  filtro = 'todos'; tag = '';
  const ja = itens.find((i) => i.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
  if (ja) { pintar(); destacar(ja.id); avisar('Esse link já estava no cofre.'); return; }

  let item;
  try { item = await enviar('/api/cofre', 'POST', { url, nome: dominio(url), categoria: categoriaDoLink(url), tags: [] }); }
  catch (e) { avisar(e.message, 'erro'); return; }
  item.organizando = true;
  itens.unshift(item);
  pintar();
  try {
    const d = await enviar('/api/cofre/ia', 'POST', { url });
    Object.assign(item, await enviar('/api/cofre', 'POST', {
      ...item,
      nome: d.nome || item.nome,
      descricao: d.descricao || item.descricao,
      categoria: d.categoria || item.categoria,
      tags: d.tags?.length ? d.tags : item.tags,
    }));
  } catch (e) { /* fica com o domínio; dá para editar depois */ }
  delete item.organizando;
  pintar();
  destacar(item.id);
  avisar('Guardado em ' + CATEGORIAS[item.categoria] + '.');
}

/* ---------- lista ---------- */
async function carregar() {
  try { ({ itens, ia: iaLigada } = await api('/api/cofre')); }
  catch (e) { $('#lista').textContent = e.message; return; }
  pintar();
}

function visiveis() {
  const termos = semAcento($('#busca').value).split(/\s+/).filter(Boolean);
  return itens
    .filter((i) => filtro === 'todos' || (filtro === 'fixados' ? i.fixado : i.categoria === filtro))
    .filter((i) => !tag || i.tags.includes(tag))
    .filter((i) => {
      if (!termos.length) return true;
      const texto = semAcento([i.nome, i.descricao, i.tags.join(' '), i.url, CATEGORIAS[i.categoria]].join(' '));
      return termos.every((t) => texto.includes(t));
    })
    .sort((a, b) => (b.fixado - a.fixado) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

function pintarFiltros() {
  const caixa = $('#filtros');
  caixa.innerHTML = '';
  const etiqueta = (chave, rotulo, n) => h('button', {
    type: 'button', class: 'cf-filtro', 'aria-pressed': String(filtro === chave),
    onclick: () => { filtro = chave; pintar(); },
  }, rotulo, h('span', { class: 'cf-filtro__n' }, String(n)));
  caixa.append(etiqueta('todos', 'Todos', itens.length));
  const fixados = itens.filter((i) => i.fixado).length;
  if (fixados) caixa.append(etiqueta('fixados', 'Fixados', fixados));
  for (const [chave, rotulo] of Object.entries(CATEGORIAS)) {
    const n = itens.filter((i) => i.categoria === chave).length;
    if (n) caixa.append(etiqueta(chave, rotulo, n));
  }
  if (tag) caixa.append(h('button', { type: 'button', class: 'cf-filtro cf-filtro--tag', onclick: () => { tag = ''; pintar(); }, 'aria-label': 'Tirar o filtro da tag ' + tag }, '#' + tag, h('span', { 'aria-hidden': 'true' }, '×')));
}

function pintar() {
  if (filtro === 'fixados' && !itens.some((i) => i.fixado)) filtro = 'todos';
  if (tag && !itens.some((i) => i.tags.includes(tag))) tag = '';
  pintarFiltros();
  const lista = $('#lista');
  lista.innerHTML = '';
  if (!itens.length) {
    lista.append(h('div', { class: 'fm-vazio' },
      h('p', { class: 'fm-vazio__t' }, 'O cofre está vazio.'),
      h('p', {}, 'Cole o primeiro link que você não quer perder. Também dá para guardar só uma anotação, como um prompt ou um comando.'),
      h('button', { type: 'button', class: 'btn btn--brand btn--peq', onclick: () => abrir() }, ico('mais'), 'Guardar link')));
    return;
  }
  const achados = visiveis();
  if (!achados.length) { lista.append(h('p', { class: 'vazio' }, 'Nada encontrado com essa busca.')); return; }
  for (const i of achados) lista.append(cartao(i));
}

function cartao(i) {
  const d = dominio(i.url);
  const icone = d
    ? h('img', { class: 'cf-card__ico', src: 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(d), alt: '', loading: 'lazy', width: 20, height: 20 })
    : h('span', { class: 'cf-card__ico cf-card__ico--nota' }, ico('nota'));
  const copiar = async () => {
    const valor = i.url || i.descricao;
    try { await navigator.clipboard.writeText(valor); avisar(i.url ? 'Link copiado.' : 'Anotação copiada.'); }
    catch (e) { avisar('Não deu para copiar.', 'erro'); }
  };
  return h('article', { class: 'fm-card cf-card' + (i.fixado ? ' cf-card--fixado' : ''), 'data-id': i.id },
    h('div', { class: 'cf-card__topo' },
      icone,
      h('span', { class: 'cf-card__cat' }, CATEGORIAS[i.categoria] || 'Outros'),
      i.fixado ? h('span', { class: 'cf-card__pino', title: 'Fixado' }, ico('fixar')) : null),
    i.url
      ? h('a', { class: 'fm-card__nome', href: i.url, target: '_blank', rel: 'noopener noreferrer' }, i.nome)
      : h('p', { class: 'fm-card__nome' }, i.nome),
    d ? h('p', { class: 'fm-card__meta' }, d) : h('p', { class: 'fm-card__meta' }, 'Anotação'),
    i.organizando ? h('p', { class: 'cf-organizando' }, iaLigada ? 'Lendo a página e organizando…' : 'Lendo a página…')
      : i.descricao ? h('p', { class: 'cf-card__desc' }, i.descricao) : null,
    i.tags.length ? h('div', { class: 'cf-tags' }, i.tags.map((t) => h('button', { type: 'button', class: 'cf-tag', onclick: () => { tag = t; pintar(); scrollTo({ top: 0 }); } }, '#' + t))) : null,
    h('div', { class: 'fm-card__acoes' },
      i.url ? h('a', { class: 'mini mini--ativo', href: i.url, target: '_blank', rel: 'noopener noreferrer' }, ico('abrir'), 'Abrir') : null,
      h('button', { type: 'button', class: 'mini', onclick: copiar }, ico('copiar'), 'Copiar'),
      h('button', { type: 'button', class: 'mini', 'aria-pressed': String(i.fixado), onclick: () => fixar(i) }, ico('fixar'), i.fixado ? 'Desafixar' : 'Fixar'),
      h('button', { type: 'button', class: 'mini cf-card__editar', onclick: () => abrir(i) }, ico('editar'), 'Editar')));
}

async function fixar(i) {
  try {
    const salvo = await enviar('/api/cofre', 'POST', { ...i, fixado: !i.fixado });
    Object.assign(i, salvo);
    pintar();
  } catch (e) { avisar(e.message, 'erro'); }
}

/* ---------- formulário ---------- */
function abrir(item = null) {
  editando = item;
  categoriaTocada = Boolean(item);
  $('#jan-eyebrow').textContent = item ? 'Editar' : 'Novo';
  $('#jan-titulo').textContent = item ? item.nome : 'Guardar no cofre';
  $('#f-url').value = item?.url || '';
  $('#f-nome').value = item?.nome || '';
  $('#f-descricao').value = item?.descricao || '';
  $('#f-categoria').value = item?.categoria || 'ferramentas';
  $('#f-tags').value = (item?.tags || []).join(', ');
  $('#f-fixado').checked = Boolean(item?.fixado);
  $('#f-apagar').hidden = !item;
  $('#f-ia-aviso').hidden = true;
  $('#jan').showModal();
  (item ? $('#f-nome') : $('#f-url')).focus();
}

function fechar() {
  $('#jan').close();
  if (location.hash) history.replaceState(null, '', location.pathname);
}

$('#f-url').addEventListener('input', () => {
  const cat = categoriaDoLink($('#f-url').value.trim());
  if (cat && !categoriaTocada) $('#f-categoria').value = cat;
});
$('#f-categoria').addEventListener('change', () => { categoriaTocada = true; });

async function gerarComIa() {
  const aviso = $('#f-ia-aviso');
  const url = $('#f-url').value.trim();
  aviso.hidden = false;
  if (!/^https?:\/\//i.test(url)) { aviso.textContent = 'Cole um link completo, com https://, para a IA ler.'; return; }
  const b = $('#f-ia');
  b.disabled = true;
  aviso.textContent = 'Lendo a página e escrevendo…';
  try {
    const d = await enviar('/api/cofre/ia', 'POST', { url });
    $('#f-nome').value = d.nome || $('#f-nome').value;
    $('#f-descricao').value = d.descricao || $('#f-descricao').value;
    if (d.categoria) { $('#f-categoria').value = d.categoria; categoriaTocada = true; }
    if (d.tags?.length) $('#f-tags').value = d.tags.join(', ');
    aviso.textContent = d.semIa ? 'Sem a IA ligada: veio o título e a descrição da própria página.' : 'Preenchido pela IA. Confira antes de salvar.';
  } catch (e) { aviso.textContent = e.message; }
  b.disabled = false;
}

async function salvar(ev) {
  ev.preventDefault();
  const url = $('#f-url').value.trim();
  const corpo = {
    id: editando?.id,
    url: url && !/^https?:\/\//i.test(url) ? 'https://' + url : url,
    nome: $('#f-nome').value.trim() || dominio(url.includes('//') ? url : 'https://' + url),
    descricao: $('#f-descricao').value,
    categoria: $('#f-categoria').value,
    tags: $('#f-tags').value.split(','),
    fixado: $('#f-fixado').checked,
  };
  const b = $('#f-salvar');
  b.disabled = true;
  try {
    const salvo = await enviar('/api/cofre', 'POST', corpo);
    if (editando) Object.assign(editando, salvo); else itens.unshift(salvo);
    fechar();
    pintar();
    avisar(editando ? 'Item atualizado.' : 'Guardado no cofre.');
  } catch (e) { $('#f-ia-aviso').hidden = false; $('#f-ia-aviso').textContent = e.message; }
  b.disabled = false;
}

async function apagar() {
  if (!editando || !confirm('Apagar "' + editando.nome + '" do cofre?\n\nNão dá para desfazer.')) return;
  try {
    await api('/api/cofre/' + encodeURIComponent(editando.id), { method: 'DELETE' });
    itens = itens.filter((x) => x.id !== editando.id);
    fechar();
    pintar();
    avisar('Item apagado.');
  } catch (e) { avisar(e.message, 'erro'); }
}

/* ---------- ligações ---------- */
for (const [chave, rotulo] of Object.entries(CATEGORIAS)) $('#f-categoria').append(h('option', { value: chave }, rotulo));
$('#novo').append(ico('mais'), 'Nova anotação');
$('#novo').onclick = () => abrir();
$('#busca-ico').append(ico('busca'));
$('#busca').addEventListener('input', () => {
  const link = ehLink($('#busca').value);
  $('#dica').dataset.tom = link ? 'acao' : '';
  $('#dica').firstChild.textContent = link ? 'Aperte Enter para guardar este link. ' : dicaPadrao;
  pintar();
});
$('#busca').addEventListener('keydown', (e) => { if (e.key === 'Enter' && ehLink($('#busca').value)) guardarRapido($('#busca').value); });

// Colar um link na barra vazia, ou em qualquer canto da tela, já guarda.
document.addEventListener('paste', (e) => {
  const t = e.target;
  const naBarraVazia = t.id === 'busca' && !t.value;
  if ($('#jan').open || (!naBarraVazia && t.closest('input, textarea, select, [contenteditable]'))) return;
  const colado = (e.clipboardData?.getData('text') || '').trim();
  // Colar exige endereço completo: "node.js" colado para buscar não vira item.
  if (!/^(https?:\/\/|www\.)/i.test(colado) || !ehLink(colado)) return;
  e.preventDefault();
  guardarRapido(colado);
});

// Favorito "Guardar no Cofre": abre /cofre?link=<página atual>.
$('#favorito').href = "javascript:location.href='" + location.origin + "/cofre?link='+encodeURIComponent(location.href)";
$('#favorito').onclick = (e) => { e.preventDefault(); avisar('Arraste este botão para a barra de favoritos.'); };
$('#favorito-caixa').hidden = false;
$('#f-ia').append(ico('ia'), 'Gerar nome e descrição com IA');
$('#f-ia').onclick = gerarComIa;
$('#f-apagar').append(ico('apagar'), 'Apagar');
$('#f-apagar').onclick = apagar;
$('#form').addEventListener('submit', salvar);
$('#jan-fechar').onclick = fechar;
$('#jan').addEventListener('cancel', () => history.replaceState(null, '', location.pathname));
$('#jan').addEventListener('click', (e) => { if (e.target === $('#jan')) fechar(); });

// "/" leva para a busca, menos quando já se está digitando num campo.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || $('#jan').open) return;
  e.preventDefault();
  $('#busca').focus();
});

let dicaPadrao = $('#dica').firstChild.textContent;
await carregar();
if (!iaLigada) $('#dica').firstChild.textContent = dicaPadrao = 'Colou um link, está guardado com o título e a descrição da página, já na categoria certa. ';
const pedido = new URLSearchParams(location.search).get('link');
if (pedido) {
  history.replaceState(null, '', location.pathname);
  if (ehLink(pedido)) guardarRapido(pedido); else avisar('Isso não parece um link.', 'erro');
}
