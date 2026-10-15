/* ============================================================
   Cofre: links úteis e anotações num lugar só.

   A lista inteira vem de uma vez e a busca e os filtros rodam
   aqui, no navegador. A barra do topo faz as duas coisas: colou
   qualquer coisa (link, prompt, comando, trecho), ela é guardada na
   hora e a IA organiza em seguida; digitou, ela busca. ?link= na
   entrada guarda direto (favorito "Guardar no Cofre"), e o campo da
   tela inicial passa o texto colado por sessionStorage.
   ============================================================ */

import { h } from '../propostas/ui.js';
import { ico } from '../icones.js';

const $ = (s, r = document) => r.querySelector(s);

const CATEGORIAS = {
  prompts: 'Prompts',
  textos: 'Textos e notas',
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
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.add('cf-card--destaque');
  setTimeout(() => el.classList.remove('cf-card--destaque'), 2500);
}

// Guarda na hora o que foi colado: link vai com o domínio e a categoria
// do endereço; texto vai inteiro, com a primeira linha de nome. A IA
// (ou, sem ela, a própria página) completa nome, descrição, categoria
// e tags logo em seguida.
async function guardarRapido(bruto) {
  const colado = String(bruto || '').trim();
  if (!colado) return;
  const link = ehLink(colado);
  const url = link ? comHttps(colado) : '';
  $('#busca').value = '';
  $('#busca').dispatchEvent(new Event('input'));
  filtro = 'todos'; tag = '';
  const ja = link
    ? itens.find((i) => i.url.replace(/\/$/, '') === url.replace(/\/$/, ''))
    : itens.find((i) => (i.conteudo || '').trim() === colado);
  if (ja) { filtrar(); destacar(ja.id); avisar(link ? 'Esse link já estava no cofre.' : 'Esse texto já estava no cofre.'); return; }

  let item;
  const novo = link
    ? { url, nome: dominio(url), categoria: categoriaDoLink(url), tags: [] }
    : { conteudo: colado, nome: colado.split('\n')[0].slice(0, 70), categoria: 'textos', tags: [] };
  try { item = await enviar('/api/cofre', 'POST', novo); }
  catch (e) { avisar(e.message, 'erro'); return; }
  item.organizando = true;
  itens.unshift(item);
  pintar();
  try {
    const d = await enviar('/api/cofre/ia', 'POST', link ? { url } : { texto: colado });
    Object.assign(item, await enviar('/api/cofre', 'POST', {
      ...item,
      nome: d.nome || item.nome,
      descricao: d.descricao || item.descricao,
      categoria: d.categoria || item.categoria,
      tags: d.tags?.length ? d.tags : item.tags,
    }));
    delete item.organizando;
    pintar();
    destacar(item.id);
    avisar('Guardado em ' + CATEGORIAS[item.categoria] + '.');
  } catch (e) {
    // Já está salvo; só a organização falhou. Dizer, para não parecer pronto.
    delete item.organizando;
    pintar();
    destacar(item.id);
    avisar('Guardado, mas a IA não organizou (' + e.message.replace(/\.$/, '') + '). Use Editar para ajustar.', 'erro');
  }
}

/* ---------- lista ---------- */
async function carregar() {
  try { ({ itens, ia: iaLigada } = await api('/api/cofre')); }
  catch (e) { $('#lista').textContent = e.message; return; }
  pintar();
}

/* Montar os cartões é o que pesa (centenas de nós por tecla). Então
   pintar() monta tudo só quando os dados mudam, e filtrar(), chamado a
   cada letra e a cada etiqueta, apenas liga e desliga o que já existe.
   O texto de busca de cada item (sem acento) também é calculado uma vez. */
let cartoes = new Map();   // item -> <article>
let textos = new Map();    // item -> texto de busca

function pintarFiltros() {
  const caixa = $('#filtros');
  caixa.innerHTML = '';
  const etiqueta = (chave, rotulo, n) => h('button', {
    type: 'button', class: 'cf-filtro', 'aria-pressed': String(filtro === chave),
    onclick: () => { filtro = chave; filtrar(); },
  }, rotulo, h('span', { class: 'cf-filtro__n' }, String(n)));
  caixa.append(etiqueta('todos', 'Todos', itens.length));
  const fixados = itens.filter((i) => i.fixado).length;
  if (fixados) caixa.append(etiqueta('fixados', 'Fixados', fixados));
  for (const [chave, rotulo] of Object.entries(CATEGORIAS)) {
    const n = itens.filter((i) => i.categoria === chave).length;
    if (n) caixa.append(etiqueta(chave, rotulo, n));
  }
  if (tag) caixa.append(h('button', { type: 'button', class: 'cf-filtro cf-filtro--tag', onclick: () => { tag = ''; filtrar(); }, 'aria-label': 'Tirar o filtro da tag ' + tag }, '#' + tag, h('span', { 'aria-hidden': 'true' }, '×')));
}

function pintar() {
  const lista = $('#lista');
  lista.innerHTML = '';
  cartoes = new Map();
  textos = new Map();
  if (!itens.length) {
    lista.append(h('div', { class: 'fm-vazio' },
      h('p', { class: 'fm-vazio__t' }, 'O cofre está vazio.'),
      h('p', {}, 'Cole aqui o que não quer perder: um link, um prompt, um comando, um trecho de texto. Ele entra organizado sozinho.')));
  }
  const ordem = [...itens].sort((a, b) => (b.fixado - a.fixado) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
  for (const i of ordem) {
    cartoes.set(i, cartao(i));
    textos.set(i, semAcento([i.nome, i.descricao, i.conteudo, i.tags.join(' '), i.url, CATEGORIAS[i.categoria]].join(' ')));
  }
  lista.append(...cartoes.values(), h('p', { class: 'vazio', id: 'nada', hidden: true }, 'Nada encontrado com essa busca.'));
  filtrar();
}

function filtrar() {
  if (filtro === 'fixados' && !itens.some((i) => i.fixado)) filtro = 'todos';
  if (tag && !itens.some((i) => i.tags.includes(tag))) tag = '';
  pintarFiltros();
  const termos = semAcento($('#busca').value).split(/\s+/).filter(Boolean);
  let algum = false;
  for (const [i, el] of cartoes) {
    const ver = (filtro === 'todos' || (filtro === 'fixados' ? i.fixado : i.categoria === filtro))
      && (!tag || i.tags.includes(tag))
      && termos.every((t) => textos.get(i).includes(t));
    if (el.hidden === ver) el.hidden = !ver;   // só toca no que muda
    algum ||= ver;
  }
  $('#nada').hidden = algum || !itens.length;
}

function cartao(i) {
  const d = dominio(i.url);
  // A inicial do domínio no lugar do favicon: buscar o ícone num serviço
  // de fora contaria a terceiros tudo o que está guardado aqui.
  const icone = d
    ? h('span', { class: 'cf-card__ico cf-card__ico--letra', 'aria-hidden': 'true' }, d[0].toUpperCase())
    : h('span', { class: 'cf-card__ico cf-card__ico--nota' }, ico('nota'));
  // Copia o que se veio buscar: o texto guardado; sem texto, o link.
  const copiar = async () => {
    const valor = i.conteudo || i.url || i.descricao;
    try { await navigator.clipboard.writeText(valor); avisar(i.conteudo ? (i.categoria === 'prompts' ? 'Prompt copiado.' : 'Texto copiado.') : 'Link copiado.'); }
    catch (e) { avisar('Não deu para copiar.', 'erro'); }
  };
  return h('article', { class: 'fm-card cf-card' + (i.fixado ? ' cf-card--fixado' : ''), 'data-id': i.id },
    h('div', { class: 'cf-card__topo' },
      icone,
      h('span', { class: 'cf-card__cat' }, CATEGORIAS[i.categoria] || 'Outros'),
      i.fixado ? h('span', { class: 'cf-card__pino', title: 'Fixado' }, ico('fixar')) : null),
    h('h3', { class: 'fm-card__nome' }, i.url ? h('a', { href: i.url, target: '_blank', rel: 'noopener noreferrer' }, i.nome) : i.nome),
    d ? h('p', { class: 'fm-card__meta' }, d) : null,
    i.organizando ? h('p', { class: 'cf-organizando' }, iaLigada ? 'Lendo e organizando…' : 'Lendo a página…')
      : i.descricao ? h('p', { class: 'cf-card__desc' }, i.descricao) : null,
    // Texto legível para leitor de tela; o clique é atalho de mouse, e o
    // teclado copia pelo botão Copiar.
    i.conteudo ? h('p', { class: 'cf-conteudo', title: 'Clique para copiar', onclick: copiar }, i.conteudo) : null,
    i.tags.length ? h('div', { class: 'cf-tags' }, i.tags.map((t) => h('button', { type: 'button', class: 'cf-tag', onclick: () => { tag = t; filtrar(); scrollTo({ top: 0 }); } }, '#' + t))) : null,
    h('div', { class: 'fm-card__acoes' },
      i.url ? h('a', { class: 'mini mini--ativo', href: i.url, target: '_blank', rel: 'noopener noreferrer' }, ico('abrir'), 'Abrir') : null,
      h('button', { type: 'button', class: 'mini' + (i.url ? '' : ' mini--ativo'), onclick: copiar }, ico('copiar'), 'Copiar'),
      h('button', { type: 'button', class: 'mini', onclick: () => fixar(i) }, ico('fixar'), i.fixado ? 'Desafixar' : 'Fixar'),
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
  $('#jan-titulo').textContent = item ? item.nome : 'Guardar no cofre';
  $('#f-url').value = item?.url || '';
  $('#f-nome').value = item?.nome || '';
  $('#f-descricao').value = item?.descricao || '';
  $('#f-conteudo').value = item?.conteudo || '';
  $('#f-categoria').value = item?.categoria || 'textos';
  $('#f-tags').value = (item?.tags || []).join(', ');
  $('#f-fixado').checked = Boolean(item?.fixado);
  $('#f-apagar').hidden = !item;
  $('#f-ia-aviso').textContent = '';
  $('#jan').showModal();
  (item ? $('#f-nome') : $('#f-conteudo')).focus();
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
  const texto = $('#f-conteudo').value.trim();
  if (!texto && !/^https?:\/\//i.test(url)) { aviso.textContent = 'Cole um link completo (com https://) ou um texto para a IA ler.'; return; }
  const b = $('#f-ia');
  b.disabled = true;
  aviso.textContent = 'Lendo e escrevendo…';
  try {
    const d = await enviar('/api/cofre/ia', 'POST', texto ? { texto } : { url });
    $('#f-nome').value = d.nome || $('#f-nome').value;
    $('#f-descricao').value = d.descricao || $('#f-descricao').value;
    if (d.categoria) { $('#f-categoria').value = d.categoria; categoriaTocada = true; }
    if (d.tags?.length) $('#f-tags').value = d.tags.join(', ');
    aviso.textContent = d.semIa ? 'Sem a IA ligada: o nome veio do título da página ou da primeira linha.' : 'Preenchido pela IA. Confira antes de salvar.';
  } catch (e) { aviso.textContent = e.message; }
  b.disabled = false;
}

async function salvar(ev) {
  ev.preventDefault();
  const url = $('#f-url').value.trim();
  const corpo = {
    id: editando?.id,
    url: url && !/^https?:\/\//i.test(url) ? 'https://' + url : url,
    nome: $('#f-nome').value.trim() || dominio(url.includes('//') ? url : 'https://' + url) || $('#f-conteudo').value.trim().split('\n')[0].slice(0, 70),
    descricao: $('#f-descricao').value,
    conteudo: $('#f-conteudo').value,
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
  } catch (e) { $('#f-ia-aviso').textContent = e.message; }
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
// Digitar busca. Enter (ou o botão Guardar) guarda o que foi digitado.
$('#busca').addEventListener('input', () => {
  const v = $('#busca').value.trim();
  $('#guardar-barra').hidden = !v;
  $('#dica').dataset.tom = v ? 'acao' : '';
  $('#dica').firstChild.textContent = v ? 'Buscando. Enter guarda isto no cofre. ' : dicaPadrao;
  filtrar();
});
$('#busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardarRapido($('#busca').value); });
$('#guardar-barra').append(ico('mais'), 'Guardar');
$('#guardar-barra').onclick = () => guardarRapido($('#busca').value);

// Colar na barra vazia, ou em qualquer canto da tela, já guarda, seja
// link, prompt ou texto. Colar dentro de um campo preenchido é só colar.
document.addEventListener('paste', (e) => {
  const t = e.target;
  // Só na barra vazia ou no fundo da tela: com o foco num botão, num
  // link ou num cartão, colar não deve criar item sem querer.
  const naBarraVazia = t.id === 'busca' && !t.value;
  const noFundo = !t.closest('button, a, input, textarea, select, [contenteditable], .cf-card');
  if ($('#jan').open || !(naBarraVazia || noFundo)) return;
  const colado = (e.clipboardData?.getData('text') || '').trim();
  if (!colado) return;
  e.preventDefault();
  guardarRapido(colado);
});

// Favorito "Guardar no Cofre": abre /cofre?link=<página atual>.
$('#favorito').href = "javascript:location.href='" + location.origin + "/cofre?link='+encodeURIComponent(location.href)";
$('#favorito').onclick = (e) => { e.preventDefault(); avisar('Arraste este botão para a barra de favoritos.'); };
$('#favorito-caixa').hidden = false;
$('#f-ia').append(ico('ia'), 'Organizar com IA');
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
if (!iaLigada) $('#dica').firstChild.textContent = dicaPadrao = 'Colou, está guardado: link, prompt, comando ou trecho. Sem a IA ligada, o nome vem do título da página ou da primeira linha. ';
let pedido = new URLSearchParams(location.search).get('link');
try { pedido = pedido || sessionStorage.getItem('cofre-colar'); sessionStorage.removeItem('cofre-colar'); } catch (e) { /* sem sessionStorage: segue só com o ?link= */ }
if (location.search) history.replaceState(null, '', location.pathname);
if (pedido) guardarRapido(pedido);
