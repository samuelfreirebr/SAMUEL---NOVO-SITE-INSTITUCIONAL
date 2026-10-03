/* ============================================================
   Editor de propostas.

   Três colunas: à esquerda as etapas (uma por seção da página, na
   ordem em que o cliente lê), no meio o formulário só da etapa
   aberta, à direita a prévia ao vivo. Proposta nova começa na
   primeira etapa e segue com "Próxima"; todas já vêm preenchidas
   com o modelo.
   ============================================================ */

import { ctx, h, clonar, chave, ligarParte, texto } from './ui.js';
import { PASSOS, ligarPassos } from './passos.js';

const $ = (s, r = document) => r.querySelector(s);

// O que pertence ao modelo (o que toda proposta nova já traz).
// Cliente, endereço, datas e situação são de cada proposta.
const CAMPOS_MODELO = ['titulo', 'subtitulo', 'validade', 'escopo', 'inclui', 'processo', 'investimento', 'pagamento',
  'condicoes', 'sobre', 'ecossistema', 'assinatura', 'encerramento', 'contato', 'faq', 'visivel', 'ordem', 'mensagemEnvio'];

// Em que ponto o cliente está. A proposta é o registro do cliente:
// contrato, briefing e produção penduram nela nas próximas etapas.
const FASES = [['preparo', 'Proposta em preparo'], ['enviada', 'Proposta enviada'], ['aprovada', 'Aprovada'],
  ['contrato', 'Contrato enviado'], ['assinado', 'Contrato assinado'], ['briefing', 'Briefing enviado'],
  ['producao', 'Em produção'], ['entregue', 'Entregue']];

// Vale enquanto o modelo não tiver a sua. {cliente} e {link} são trocados na hora de copiar.
const MENSAGEM_PADRAO = 'Oi! Como combinamos na reunião, aqui está a proposta do projeto da {cliente}:\n\n{link}\n\nEla reúne o escopo, o processo, o investimento e as condições. Qualquer dúvida, me chama por aqui.';

const REVISAR = { id: 'revisar', titulo: 'Revisar e salvar', resumo: 'Confira o que falta e publique.' };

/* ---------- estado ---------- */
const est = {
  modelo: {},
  propostas: [],
  reunioes: [],
  proposta: null,
  salva: '',
  modo: 'lista',        // 'lista' | 'proposta' | 'modelo'
  novo: false,          // proposta ainda não salva nenhuma vez
  passo: 0,
  visitados: new Set(),
  previa: 'computador', // 'computador' | 'celular'
};
const suja = () => est.modo !== 'lista' && JSON.stringify(est.proposta) !== est.salva;
/* Seções que podem trocar de lugar na página (as mesmas do
   renderizador). As etapas do editor seguem essa ordem, para o que
   você vê à esquerda ser a sequência da página. */
const ORDEM_PADRAO = ['escopo', 'inclui', 'processo', 'investimento', 'condicoes', 'sobre', 'ecossistema', 'encerramento', 'faq'];
const ordemDe = (p) => [...new Set([...(Array.isArray(p?.ordem) ? p.ordem.filter((x) => ORDEM_PADRAO.includes(x)) : []), ...ORDEM_PADRAO])];
const passos = () => {
  const base = PASSOS.filter((p) => est.modo !== 'modelo' || !p.soProposta);
  const ordem = ordemDe(est.proposta);
  const posicao = (ps) => { const i = ordem.indexOf(ps.id); return i < 0 ? -1 : i; };
  const fixos = base.filter((ps) => posicao(ps) < 0);
  const moveis = base.filter((ps) => posicao(ps) >= 0).sort((a, b) => posicao(a) - posicao(b));
  return [...fixos, ...moveis, REVISAR];
};
function moverSecao(id, delta) {
  const ordem = ordemDe(est.proposta);
  const i = ordem.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ordem.length) return;
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  // guarda só se difere do padrão: proposta que nunca reordenou não ganha o campo
  if (ordem.join() === ORDEM_PADRAO.join()) delete est.proposta.ordem; else est.proposta.ordem = ordem;
  est.passo = passos().findIndex((ps) => ps.id === id);
  mudou(); pintarNav(); pintarPasso();
}

const faltaEm = (ps, p) => (est.modo === 'modelo' ? '' : ps.falta?.(p) || '');

/* ---------- API ---------- */
async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  const bruto = await r.text();
  if (r.status === 401) { location.replace('/admin/entrar?voltar=' + encodeURIComponent(location.pathname)); throw new Error('sessão encerrada'); }
  let dado;
  try { dado = JSON.parse(bruto); } catch (e) { throw new Error('o servidor respondeu algo que não é JSON.'); }
  if (!r.ok) throw new Error(dado.erro || ('erro ' + r.status));
  return dado;
}
const enviarJson = (url, metodo, corpo) => api(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

let tAviso;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = txt; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(tAviso);
  if (tipo === 'ok') tAviso = setTimeout(() => el.classList.remove('mostra'), 3500);
}

/* ---------- topo ---------- */
function pintarTopo() {
  const acoes = $('#topo-acoes');
  acoes.innerHTML = '';
  const sec = $('#topo-sec');
  if (est.modo === 'lista') {
    sec.textContent = 'Propostas';
    acoes.append(
      h('button', { type: 'button', class: 'mini', onclick: editarModelo, title: 'O que toda proposta nova já traz preenchido' }, 'Editar modelo'),
      h('button', { type: 'button', class: 'mini', onclick: abrirModeloContrato, title: 'As cláusulas fixas e sua conta para receber em reais' }, 'Modelo do contrato'),
      h('button', { type: 'button', class: 'mini mini--ativo', onclick: nova }, '+ Nova proposta'));
  } else {
    sec.textContent = est.modo === 'modelo' ? 'Modelo' : (est.proposta.cliente || 'Nova proposta');
    acoes.append(...[
      h('button', { type: 'button', class: 'mini', onclick: voltarParaLista }, '← Propostas'),
      h('span', { class: 'ed-estado', id: 'estado' }),
      est.modo === 'proposta' && est.proposta.id && !est.novo
        && h('a', { class: 'mini', href: '/propostas/' + est.proposta.id, target: '_blank', rel: 'noopener' }, 'Abrir página'),
      h('button', { type: 'button', class: 'mini ed-so-estreito', onclick: alternarPrevia }, 'Prévia'),
      est.modo === 'proposta'
        && h('button', { type: 'button', class: 'mini mini--ia', id: 'btn-ia', onclick: abrirIa, title: 'Cole a conversa ou anexe arquivos e a IA preenche o escopo, o valor e o resto' }, 'Preencher com IA'),
      h('button', { type: 'button', class: 'mini mini--ativo', id: 'salvar', onclick: salvar }, est.modo === 'modelo' ? 'Salvar modelo' : 'Salvar'),
    ].filter(Boolean));
    pintarEstado();
  }
  acoes.append(h('button', { type: 'button', class: 'mini', onclick: sair }, 'Sair'));
}
function pintarEstado() {
  const el = $('#estado'); if (!el) return;
  const s = suja();
  el.textContent = s ? 'Alterações não salvas' : (est.novo ? 'Ainda não salva' : 'Tudo salvo');
  el.dataset.sujo = s || est.novo ? '1' : '0';
}

/* ---------- lista ---------- */
async function carregar() {
  try {
    const [modelo, lista, icones] = await Promise.all([
      api('/api/modelo-proposta'),
      api('/api/propostas').then((d) => d.propostas || []),
      api('/api/proposta-icones'),
    ]);
    // As reuniões não podem derrubar a lista se a rota falhar.
    est.reunioes = await api('/api/reunioes').then((d) => d.reunioes || []).catch(() => []);
    est.modelo = modelo; est.propostas = lista;
    ctx.icones = icones.icones || [];
    ctx.pistas = (icones.pistas || []).map(([src, flags, nome]) => [new RegExp(src, flags), nome]);
  } catch (e) { if (!/sessão/.test(e.message)) avisar('Não carreguei: ' + e.message, 'erro'); }
}

/* Ícones do painel: mesmo traço da seta do site (1.6, ponta redonda). */
const DESENHOS = {
  doc: '<path d="M13 2H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5zM13 2v3h3M7 11h6M7 14h6"/>',
  lista: '<path d="M8 5h9M8 10h9M8 15h9"/><circle cx="4" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="15" r="1" fill="currentColor" stroke="none"/>',
  olho: '<path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/>',
  elo: '<path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.54 3.54 0 0 0 5 5l1-1"/>',
  balao: '<path d="M17.5 9.5a6.5 6.5 0 0 1-9.4 5.8L3.5 17l1.6-4.3A6.5 6.5 0 1 1 17.5 9.5z"/>',
  mais: '<circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
};
function ico(nome) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 20 20');
  el.setAttribute('width', '15'); el.setAttribute('height', '15');
  el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.6'); el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round'); el.setAttribute('aria-hidden', 'true');
  el.innerHTML = DESENHOS[nome] || '';
  return el;
}

/* Menu do que se usa pouco. <details> nativo: abre no clique e no
   teclado sem script, e fecha ao escolher. */
function menuMais(itens) {
  const lista = h('div', { class: 'ed-mais__lista' },
    ...itens.map(([rotulo, acao, perigo]) => h('button', {
      type: 'button', class: 'ed-mais__item' + (perigo ? ' ed-mais__item--perigo' : ''),
      onclick: (e) => { e.target.closest('details').open = false; acao(); },
    }, rotulo)));
  return h('details', { class: 'ed-mais' },
    h('summary', { class: 'ed-acao ed-acao--ico', title: 'Mais opções', 'aria-label': 'Mais opções' }, ico('mais')),
    lista);
}
// Um menu aberto fecha quando se clica em qualquer outro lugar.
document.addEventListener('click', (e) => {
  for (const d of document.querySelectorAll('details.ed-mais[open]')) {
    if (!d.contains(e.target)) d.open = false;
  }
});

function mostrarLista() {
  est.modo = 'lista'; est.proposta = null;
  history.replaceState(null, '', location.pathname);
  pintarTopo();
  const raiz = $('#app');
  raiz.className = 'ed-raiz ed-raiz--lista';
  raiz.innerHTML = '';

  const cards = est.propostas.map((p) => {
    const link = location.origin + '/propostas/' + p.id;
    return h('article', { class: 'ed-prop' },
      h('div', { class: 'ed-prop__topo' },
        h('span', { class: 'ed-prop__estado', 'data-ar': p.publicada ? '1' : '0' }, p.publicada ? 'No ar' : 'Rascunho'),
        seletorFase(p.fase, (f) => mudarFase(p.id, f))),
      h('button', { type: 'button', class: 'ed-prop__abrir', onclick: () => abrir(p.id) },
        h('b', { class: 'ed-prop__nome' }, p.cliente || p.id),
        h('span', { class: 'ed-prop__titulo' }, p.titulo || ''),
        h('span', { class: 'ed-prop__meta' }, '/propostas/' + p.id + (p.atualizadaEm ? ' · ' + new Date(p.atualizadaEm).toLocaleDateString('pt-BR') : ''))),
      /* Três pesos, não nove botões iguais: a ação principal cheia, o
         que gera documento com ícone, o que só leva o link em texto,
         e o raro (duplicar, apagar) atrás do menu. A fase subiu para
         o topo do cartão: é estado, não ação. */
      h('div', { class: 'ed-prop__acoes' },
        h('button', { type: 'button', class: 'mini mini--ativo', onclick: () => abrir(p.id) }, 'Editar'),
        h('div', { class: 'ed-grupo' },
          h('button', { type: 'button', class: 'ed-doc', onclick: () => abrirContrato(p), title: 'Gera o contrato desta proposta e deixa pronto para assinar' }, ico('doc'), 'Contrato'),
          h('button', { type: 'button', class: 'ed-doc', onclick: () => abrirPerguntas(p), title: 'Monta o briefing e dá o link para o cliente responder' }, ico('lista'), 'Perguntas')),
        h('span', { class: 'ed-sep', 'aria-hidden': 'true' }),
        h('div', { class: 'ed-grupo' },
          h('a', { class: 'ed-acao', href: '/propostas/' + p.id, target: '_blank', rel: 'noopener', title: 'Abre a página da proposta' }, ico('olho'), 'Ver'),
          h('button', { type: 'button', class: 'ed-acao', title: 'Copia o endereço da proposta', onclick: async () => { try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch (e) { avisar(link); } } }, ico('elo'), 'Link'),
          h('button', { type: 'button', class: 'ed-acao', onclick: () => copiarMensagem(p.id), title: 'Copia a mensagem pronta com o link desta proposta' }, ico('balao'), 'Mensagem')),
        menuMais([
          ['Duplicar', () => duplicar(p.id)],
          ['Apagar', () => apagar(p), true],
        ])));
  });

  // Transcrições que ainda não viraram proposta.
  const usadas = new Set(est.propostas.map((p) => p.reuniao).filter(Boolean));
  const novas = est.reunioes.filter((r) => !usadas.has(r.id));
  const caixa = novas.length > 0 && h('section', { class: 'ed-reunioes' },
    h('p', { class: 'eyebrow' }, 'Reuniões'),
    h('p', { class: 'ed-lista__apoio' }, 'Transcrições que chegaram do Meet e ainda não viraram proposta.'),
    h('div', { class: 'ed-reunioes__lista' }, novas.map((r) => h('article', { class: 'ed-reuniao' },
      h('div', { class: 'ed-reuniao__txt' },
        h('b', {}, r.titulo || 'Reunião'),
        h('small', {}, new Date(r.data || r.recebidaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + Math.round(r.tamanho / 1000) + ' mil caracteres')),
      h('div', { class: 'ed-prop__acoes' },
        h('button', { type: 'button', class: 'mini mini--ativo', onclick: () => novaComReuniao(r.id) }, 'Criar proposta com esta'),
        h('button', { type: 'button', class: 'mini', onclick: () => baixarReuniao(r.id) }, 'Baixar'),
        h('button', { type: 'button', class: 'mini mini--perigo', onclick: () => apagarReuniao(r) }, 'Apagar'))))));

  raiz.append(h('div', { class: 'ed-lista' },
    caixa,
    h('header', { class: 'ed-lista__cab' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Propostas'),
        h('h1', { class: 'ed-lista__titulo' }, 'Suas propostas'),
        h('p', { class: 'ed-lista__apoio' }, 'Cada proposta vira uma página. A nova já vem com o texto do modelo: você segue as etapas e troca o que for diferente.')),
      h('div', { class: 'ed-lista__cta' },
        h('button', { type: 'button', class: 'btn btn--brand', onclick: nova }, '+ Nova proposta'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: editarModelo }, 'Editar modelo'))),
    cards.length ? h('div', { class: 'ed-lista__grade' }, cards)
      : h('p', { class: 'ed-vazio' }, 'Nenhuma proposta ainda. Clique em Nova proposta.')));
}

/* ---------- fase, mensagem e reuniões ---------- */
function seletorFase(atual, aoTrocar) {
  const sel = h('select', { class: 'ed-fase', 'aria-label': 'Fase do cliente' }, FASES.map(([v, r]) => h('option', { value: v }, r)));
  sel.value = FASES.some(([v]) => v === atual) ? atual : 'preparo';
  sel.addEventListener('change', () => aoTrocar(sel.value));
  return sel;
}

async function mudarFase(id, fase) {
  try {
    const p = await api('/api/propostas/' + encodeURIComponent(id));
    p.fase = fase;
    await enviarJson('/api/propostas', 'POST', p);
    const item = est.propostas.find((x) => x.id === id); if (item) item.fase = fase;
    avisar((p.cliente || id) + ': ' + FASES.find(([v]) => v === fase)[1].toLowerCase() + '.');
  } catch (e) { avisar('Não mudei a fase: ' + e.message, 'erro'); }
}

const mensagemDe = (p) => String(p.mensagemEnvio || est.modelo.mensagemEnvio || MENSAGEM_PADRAO)
  .replaceAll('{cliente}', p.cliente || '').replaceAll('{link}', location.origin + '/propostas/' + p.id);

// Da lista (id) ou de dentro do editor (sem id: a proposta aberta).
// Copiar a mensagem é o gesto de enviar: a fase anda para "enviada".
async function copiarMensagem(id) {
  try {
    const doEditor = !id;
    const p = doEditor ? est.proposta : await api('/api/propostas/' + encodeURIComponent(id));
    if (!p.id || (doEditor && est.novo)) { avisar('Salve a proposta antes: o link ainda não existe.', 'erro'); return; }
    const msg = mensagemDe(p);
    try { await navigator.clipboard.writeText(msg); } catch (e) { prompt('Copie a mensagem:', msg); }
    const andou = !p.fase || p.fase === 'preparo';
    if (andou) p.fase = 'enviada';
    if (doEditor) { if (andou) { mudou(); pintarPasso(); } }
    else if (andou) { await enviarJson('/api/propostas', 'POST', p); await carregar(); mostrarLista(); }
    avisar(p.publicada === false
      ? 'Mensagem copiada, mas a proposta está em rascunho: ligue "No ar" ou o cliente não abre o link.'
      : 'Mensagem copiada.', p.publicada === false ? 'erro' : 'ok');
  } catch (e) { avisar('Não copiei: ' + e.message, 'erro'); }
}

async function novaComReuniao(id) {
  try {
    const r = await api('/api/reunioes/' + encodeURIComponent(id));
    nova();
    est.proposta.reuniao = r.id;
    await abrirIa();
    $('#ia-texto').value = r.texto;
    if (iaLigada) preencherComIa();
  } catch (e) { avisar('Não abri a reunião: ' + e.message, 'erro'); }
}

async function baixarReuniao(id) {
  try {
    const r = await api('/api/reunioes/' + encodeURIComponent(id));
    const a = h('a', { href: URL.createObjectURL(new Blob([r.texto], { type: 'text/plain;charset=utf-8' })), download: (r.titulo || 'reuniao').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80) + '.txt' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { avisar('Não baixei: ' + e.message, 'erro'); }
}

async function apagarReuniao(r) {
  if (!confirm('Apagar a transcrição "' + (r.titulo || 'Reunião') + '"? Ela continua no seu Google Drive.')) return;
  try {
    await api('/api/reunioes/' + encodeURIComponent(r.id), { method: 'DELETE' });
    await carregar(); mostrarLista();
  } catch (e) { avisar('Não apaguei: ' + e.message, 'erro'); }
}

/* ---------- abrir / nova / duplicar / apagar ---------- */
function confirmarDescarte() { return !suja() || confirm('Há alterações não salvas. Descartar?'); }

async function abrir(id, passo = 0) {
  if (!confirmarDescarte()) return;
  try {
    const p = await api('/api/propostas/' + encodeURIComponent(id));
    abrirEditor(p, { modo: 'proposta', novo: false, passo });
    history.replaceState(null, '', '#' + id);
  } catch (e) { avisar('Não abri: ' + e.message, 'erro'); }
}

function nova() {
  if (!confirmarDescarte()) return;
  const base = clonar(est.modelo) || {};
  const p = { id: '', cliente: '', preparadaPara: '', data: '', publicada: false };
  for (const k of CAMPOS_MODELO) if (base[k] !== undefined) p[k] = base[k];
  abrirEditor(p, { modo: 'proposta', novo: true, passo: 0 });
  setTimeout(() => $('#form input')?.focus(), 50);
}

async function duplicar(id) {
  if (!confirmarDescarte()) return;
  try {
    const p = await api('/api/propostas/' + encodeURIComponent(id));
    delete p.criadaEm; delete p.atualizadaEm;
    p.id = ''; p.cliente = ''; p.preparadaPara = ''; p.data = ''; p.publicada = false;
    abrirEditor(p, { modo: 'proposta', novo: true, passo: 0 });
    avisar('Cópia aberta. Troque o cliente antes de salvar.');
  } catch (e) { avisar('Não dupliquei: ' + e.message, 'erro'); }
}

async function apagar(p) {
  if (!confirm('Apagar a proposta de ' + (p.cliente || p.id) + '? O link para de funcionar.')) return;
  try {
    await api('/api/propostas/' + encodeURIComponent(p.id), { method: 'DELETE' });
    avisar('Apagada.');
    await carregar(); mostrarLista();
  } catch (e) { avisar('Não apaguei: ' + e.message, 'erro'); }
}

function editarModelo() {
  if (!confirmarDescarte()) return;
  abrirEditor(clonar(est.modelo) || {}, { modo: 'modelo', novo: false, passo: 0 });
}

function voltarParaLista() {
  if (!confirmarDescarte()) return;
  est.salva = JSON.stringify(est.proposta);   // já confirmou o descarte
  mostrarLista();
}

/* ---------- editor ---------- */
function abrirEditor(p, { modo, novo, passo }) {
  // A mensagem de envio nasce aqui, antes de guardar o estado salvo:
  // preenchida só ao abrir a revisão, a proposta apareceria "alterada".
  if (p.mensagemEnvio === undefined) p.mensagemEnvio = est.modelo.mensagemEnvio || MENSAGEM_PADRAO;
  // Seção que a proposta não tem vem do modelo, como na página
  // pública: o editor mostra o que o cliente vê.
  // Igual ao comModelo() do servidor: seção ausente vem inteira;
  // objeto presente é completado campo a campo; listas não se misturam.
  if (modo === 'proposta') {
    const vazio = (v) => v === undefined || v === null || v === '';
    const objeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
    for (const k of CAMPOS_MODELO) {
      const padrao = est.modelo[k];
      if (padrao === undefined || k === 'visivel' || k === 'ordem') continue;
      if (vazio(p[k])) { p[k] = clonar(padrao); continue; }
      if (objeto(p[k]) && objeto(padrao)) {
        for (const [c, v] of Object.entries(padrao)) if (vazio(p[k][c])) p[k][c] = clonar(v);
      }
    }
  }
  // As etapas completam estruturas vazias (listas, objetos) ao montar.
  // Montando todas uma vez antes de guardar o estado salvo, abrir uma
  // proposta não aparece como "alterada".
  for (const ps of PASSOS) ps.montar(p, { novo });
  est.proposta = p; est.modo = modo; est.novo = novo;
  est.salva = novo ? '' : JSON.stringify(p);
  est.passo = passo;
  est.visitados = new Set(novo ? [0] : passos().map((_, i) => i));
  pintarTopo();

  const raiz = $('#app');
  raiz.className = 'ed-raiz ed-raiz--editor';
  raiz.innerHTML = '';
  raiz.append(
    h('nav', { class: 'ed-nav', id: 'nav', 'aria-label': 'Etapas' }),
    h('div', { class: 'ed-form', id: 'form' }),
    h('aside', { class: 'ed-previa', id: 'previa', 'aria-label': 'Prévia' },
      h('div', { class: 'ed-previa__barra' },
        h('b', {}, 'Prévia ao vivo'),
        h('div', { class: 'ed-seg', role: 'group' },
          ...['computador', 'celular'].map((m) => h('button', { type: 'button', 'data-modo': m, 'aria-pressed': String(est.previa === m), onclick: () => trocarModoPrevia(m) }, m === 'computador' ? 'Computador' : 'Celular'))),
        h('button', { type: 'button', class: 'ed-icobtn ed-so-estreito', title: 'Fechar prévia', html: '&times;', onclick: alternarPrevia })),
      h('div', { class: 'ed-previa__palco', id: 'palco' },
        h('div', { class: 'ed-previa__moldura', id: 'moldura' },
          h('iframe', { id: 'quadro', title: 'Prévia da proposta', tabindex: '-1' })))));

  quadroPronto = false;
  pintarNav();
  pintarPasso();
  medirPrevia();
  pedirPrevia(0);
}

function pintarNav() {
  const nav = $('#nav'); if (!nav) return;
  const p = est.proposta;
  nav.innerHTML = '';
  nav.append(h('p', { class: 'ed-nav__rot' }, est.modo === 'modelo' ? 'Seções do modelo' : 'Etapas'));
  const ol = h('ol', { class: 'ed-nav__lista' });
  passos().forEach((ps, i) => {
    const oculta = ps.parte && p.visivel?.[ps.parte] === false;
    const falta = faltaEm(ps, p);
    const feito = est.visitados.has(i) && !falta;
    let estado = '';
    if (oculta) estado = 'Oculta';
    else if (falta && est.visitados.has(i)) estado = 'Falta preencher';
    ol.append(h('li', {},
      h('button', {
        type: 'button', class: 'ed-nav__item', 'aria-current': i === est.passo ? 'step' : null,
        'aria-label': (i + 1) + '. ' + ps.titulo + (estado ? ' (' + estado.toLowerCase() + ')' : ''),
        'data-oculta': oculta ? '1' : null, 'data-falta': falta && est.visitados.has(i) ? '1' : null,
        onclick: () => irPara(i),
      },
      h('span', { class: 'ed-nav__n' }, feito && i !== est.passo ? '✓' : String(i + 1)),
      h('span', { class: 'ed-nav__txt' }, h('b', {}, ps.titulo), estado && h('small', {}, estado)))));
  });
  nav.append(ol);
  // no celular as etapas são uma faixa: a atual fica à vista
  ol.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function irPara(i) {
  const lista = passos();
  est.passo = Math.max(0, Math.min(lista.length - 1, i));
  est.visitados.add(est.passo);
  pintarNav();
  pintarPasso();
  $('#form').scrollTop = 0;
  focarNaPrevia();
}

function pintarPasso() {
  const form = $('#form'); if (!form) return;
  const lista = passos();
  const ps = lista[est.passo];
  const p = est.proposta;
  form.innerHTML = '';

  const corpo = h('div', { class: 'ed-form__corpo' });
  const acoesCab = h('div', { class: 'ed-form__acoes' });

  if (ps.parte) {
    acoesCab.append(chave({
      rotulo: 'Mostrar na proposta', grande: true,
      ler: () => p.visivel?.[ps.parte] !== false,
      escrever: (v) => {
        ligarParte(p, ps.parte, v);
        corpo.classList.toggle('ed-desligado', !v);
        pintarNav();
      },
    }));
    corpo.classList.toggle('ed-desligado', p.visivel?.[ps.parte] === false);
  }
  if (ps.chaves && est.modo === 'proposta') {
    acoesCab.append(h('button', { type: 'button', class: 'mini', onclick: () => restaurar(ps), title: 'Volta os textos desta etapa para os do modelo' }, 'Restaurar texto padrão'));
  }
  if (ORDEM_PADRAO.includes(ps.id)) {
    const ordem = ordemDe(p);
    const pos = ordem.indexOf(ps.id);
    acoesCab.append(h('div', { class: 'ed-ordem', title: 'Posição desta seção na página' },
      h('span', { class: 'ed-ordem__rot' }, 'Posição na página: ' + (pos + 1) + ' de ' + ordem.length),
      h('button', { type: 'button', class: 'mini', disabled: pos === 0 ? '' : null, onclick: () => moverSecao(ps.id, -1), title: 'Subir na página' }, '↑ Subir'),
      h('button', { type: 'button', class: 'mini', disabled: pos === ordem.length - 1 ? '' : null, onclick: () => moverSecao(ps.id, 1), title: 'Descer na página' }, '↓ Descer')));
  }

  form.append(h('header', { class: 'ed-form__cab' },
    h('p', { class: 'ed-form__passo' }, 'Etapa ' + (est.passo + 1) + ' de ' + lista.length),
    h('h2', { class: 'ed-form__titulo' }, ps.titulo),
    h('p', { class: 'ed-form__resumo' }, ps.resumo),
    acoesCab.childNodes.length ? acoesCab : null));

  if (ps === REVISAR) corpo.append(...montarRevisao());
  else corpo.append(...ps.montar(p, { novo: est.novo }));
  form.append(corpo);

  const anterior = lista[est.passo - 1];
  const proxima = lista[est.passo + 1];
  form.append(h('footer', { class: 'ed-form__pe' },
    anterior ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => irPara(est.passo - 1) }, '← ' + anterior.titulo) : h('span'),
    proxima
      ? h('button', { type: 'button', class: 'btn btn--brand', onclick: () => irPara(est.passo + 1) }, 'Próxima: ' + proxima.titulo + ' →')
      : h('button', { type: 'button', class: 'btn btn--brand', onclick: salvar }, est.modo === 'modelo' ? 'Salvar modelo' : 'Salvar proposta')));
}

function restaurar(ps) {
  const nomes = ps.chaves.filter((k) => est.modelo[k] !== undefined);
  if (!nomes.length) { avisar('O modelo não tem texto para esta etapa.', 'erro'); return; }
  if (!confirm('Trocar os textos de "' + ps.titulo + '" pelos do modelo? O que você mudou nesta etapa se perde.')) return;
  for (const k of nomes) est.proposta[k] = clonar(est.modelo[k]);
  mudou(); pintarPasso();
  avisar('Textos de ' + ps.titulo + ' restaurados.');
}

function montarRevisao() {
  const p = est.proposta;
  const lista = passos().slice(0, -1);
  const itens = lista.map((ps) => {
    const i = passos().indexOf(ps);
    const oculta = ps.parte && p.visivel?.[ps.parte] === false;
    const falta = faltaEm(ps, p);
    return h('li', {},
      h('button', { type: 'button', class: 'ed-rev__item', 'data-tipo': falta ? 'falta' : oculta ? 'oculta' : 'ok', onclick: () => irPara(i) },
        h('span', { class: 'ed-rev__marca', 'aria-hidden': 'true' }, falta ? '!' : oculta ? '·' : '✓'),
        h('b', {}, ps.titulo),
        h('small', {}, falta || (oculta ? 'Oculta na página' : 'Pronta'))));
  });
  const blocos = [h('section', { class: 'ed-bloco' },
    h('header', { class: 'ed-bloco__cab' }, h('div', {}, h('h3', { class: 'ed-bloco__titulo' }, 'Conferência'))),
    h('ol', { class: 'ed-rev' }, itens))];

  const campoMensagem = texto(p, 'mensagemEnvio', 'Mensagem que acompanha o link', { area: true, linhas: 6, dica: '{cliente} vira o nome do cliente e {link} vira o endereço da proposta.' });

  if (est.modo === 'modelo') {
    blocos.push(h('section', { class: 'ed-bloco' },
      h('header', { class: 'ed-bloco__cab' }, h('div', {}, h('h3', { class: 'ed-bloco__titulo' }, 'Envio'))),
      h('div', { class: 'ed-bloco__corpo' }, campoMensagem)));
    blocos.push(h('section', { class: 'ed-bloco' },
      h('p', { class: 'ed-bloco__dica' }, 'O modelo vale para as próximas propostas. As que já existem não mudam.')));
    return blocos;
  }

  blocos.push(h('section', { class: 'ed-bloco' },
    h('header', { class: 'ed-bloco__cab' }, h('div', {}, h('h3', { class: 'ed-bloco__titulo' }, 'Envio e fase'))),
    h('div', { class: 'ed-bloco__corpo' },
      campoMensagem,
      h('div', { class: 'ed-prop__acoes' },
        h('button', { type: 'button', class: 'mini mini--ativo', onclick: () => copiarMensagem() }, 'Copiar mensagem'),
        p.reuniao && h('button', { type: 'button', class: 'mini', onclick: () => baixarReuniao(p.reuniao) }, 'Baixar transcrição da reunião')),
      h('label', { class: 'ed-campo' },
        h('span', { class: 'ed-campo__rot' }, 'Fase do cliente'),
        seletorFase(p.fase, (f) => { p.fase = f; mudou(); })))));

  const link = p.id ? location.origin + '/propostas/' + p.id : '';
  blocos.push(h('section', { class: 'ed-bloco' },
    h('header', { class: 'ed-bloco__cab' }, h('div', {}, h('h3', { class: 'ed-bloco__titulo' }, 'Publicação'))),
    h('div', { class: 'ed-bloco__corpo' },
      chave({ rotulo: 'No ar', dica: 'Ligado, quem tem o link abre. Desligado, só você vê.', ler: () => p.publicada !== false, escrever: (v) => { p.publicada = v; } }),
      link && h('div', { class: 'ed-link' },
        h('code', {}, link),
        h('button', { type: 'button', class: 'mini', onclick: async () => { try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch (e) { avisar(link); } } }, 'Copiar')),
      h('button', { type: 'button', class: 'mini', onclick: salvarComoModelo, title: 'Os textos desta proposta passam a ser o padrão das próximas' }, 'Usar esta proposta como modelo'))));
  return blocos;
}

/* ---------- mudanças ---------- */
function mudou() {
  pintarEstado();
  pedirPrevia();
  clearTimeout(tNav); tNav = setTimeout(pintarNav, 250);
  if (est.modo === 'proposta') $('#topo-sec').textContent = est.proposta.cliente || 'Nova proposta';
}
let tNav;
ctx.mudou = mudou;

/* ---------- prévia ----------
   O servidor monta a página com o mesmo renderizador da pública. A
   primeira vez entra inteira no iframe; as seguintes trocam só o
   <body>, para a rolagem da prévia não voltar ao topo a cada letra. */
let tPrevia, seqPrevia = 0, quadroPronto = false;

function pedirPrevia(atraso = 350) {
  clearTimeout(tPrevia);
  tPrevia = setTimeout(atualizarPrevia, atraso);
}

async function atualizarPrevia() {
  const quadro = $('#quadro'); if (!quadro || est.modo === 'lista') return;
  const n = ++seqPrevia;
  const dado = est.modo === 'modelo'
    ? { ...est.proposta, cliente: 'Cliente exemplo', id: 'exemplo' }
    : est.proposta;
  let html;
  try {
    const r = await fetch('/api/proposta-previa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dado) });
    if (!r.ok) throw new Error('erro ' + r.status);
    html = await r.text();
  } catch (e) { avisar('A prévia não atualizou: ' + e.message, 'erro'); return; }
  if (n !== seqPrevia) return;   // chegou uma mais nova

  const doc = quadro.contentDocument;
  if (!quadroPronto || !doc?.body) {
    quadro.onload = () => { quadroPronto = true; prepararQuadro(); focarNaPrevia(); };
    quadro.srcdoc = html;
    return;
  }
  const novo = new DOMParser().parseFromString(html, 'text/html');
  doc.body.className = novo.body.className;
  doc.body.innerHTML = novo.body.innerHTML;
  marcarAlvo();
}

function prepararQuadro() {
  const doc = $('#quadro').contentDocument;
  doc.head.append(Object.assign(doc.createElement('style'), {
    textContent: '.ed-alvo{outline:2px solid #FF4F18;outline-offset:-2px}'
      + 'html{scrollbar-width:thin}body{cursor:default}',
  }));
  // Clique na prévia abre a etapa daquela seção; links não navegam.
  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && !(a.getAttribute('href') || '').startsWith('#')) e.preventDefault();
    if (e.target.closest('a, button, summary')) return;
    const lista = passos();
    for (let i = lista.length - 1; i >= 0; i--) {
      const alvo = lista[i].alvo && doc.querySelector(lista[i].alvo);
      if (alvo && alvo.contains(e.target)) {
        // capa pertence a Cliente e a Capa: fica na que já está aberta
        if (lista[est.passo]?.alvo === lista[i].alvo) return;
        irPara(i); return;
      }
    }
  });
}

function marcarAlvo() {
  const doc = $('#quadro')?.contentDocument; if (!doc?.body) return;
  doc.querySelectorAll('.ed-alvo').forEach((el) => el.classList.remove('ed-alvo'));
  const ps = passos()[est.passo];
  if (ps.id === 'faq') doc.getElementById('duvidas')?.classList.add('aberto');
  const el = ps.alvo && doc.querySelector(ps.alvo);
  el?.classList.add('ed-alvo');
  return el;
}

// Salto direto: a rolagem suave dentro do iframe parava no meio do
// caminho quando a distância era grande.
function focarNaPrevia() {
  if (!quadroPronto) return;
  const el = marcarAlvo();
  const win = $('#quadro').contentWindow;
  if (!el) return;
  const topo = el.getBoundingClientRect().top + win.scrollY;
  win.scrollTo({ top: Math.max(0, topo - 24), behavior: 'instant' });
}

// A prévia de computador desenha a página a 1440px e reduz para caber;
// a de celular, a 390px.
function medirPrevia() {
  const palco = $('#palco'), moldura = $('#moldura'), quadro = $('#quadro');
  if (!palco || !quadro) return;
  const largura = est.previa === 'celular' ? 390 : 1440;
  const disponivel = palco.clientWidth - 32;
  const escala = Math.min(1, disponivel / largura);
  const altura = (palco.clientHeight - 32) / escala;
  quadro.style.width = largura + 'px';
  quadro.style.height = altura + 'px';
  quadro.style.transform = 'scale(' + escala + ')';
  moldura.style.width = largura * escala + 'px';
  moldura.style.height = altura * escala + 'px';
  moldura.dataset.modo = est.previa;
}
function trocarModoPrevia(m) {
  est.previa = m;
  document.querySelectorAll('.ed-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
  medirPrevia();
  setTimeout(() => focarNaPrevia(), 50);
}
function alternarPrevia() {
  document.body.classList.toggle('ed-previa-aberta');
  requestAnimationFrame(() => { medirPrevia(); focarNaPrevia(); });
}
new ResizeObserver(() => medirPrevia()).observe(document.documentElement);

/* ---------- salvar ---------- */
async function salvar() {
  if (est.modo === 'modelo') return salvarModelo();
  const p = est.proposta;
  if (!p.cliente) { irPara(0); avisar('Falta o nome do cliente.', 'erro'); return; }
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(p.id || '')) { irPara(0); avisar('Endereço inválido: só minúsculas, números e hífen (mínimo 2).', 'erro'); return; }
  if (est.novo && est.propostas.some((x) => x.id === p.id) && !confirm('Já existe uma proposta em /propostas/' + p.id + '. Substituir?')) return;
  const b = $('#salvar'); if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
  try {
    const r = await enviarJson('/api/propostas', 'POST', p);
    est.proposta = r.proposta; est.salva = JSON.stringify(r.proposta); est.novo = false;
    history.replaceState(null, '', '#' + r.id);
    await carregar();
    pintarTopo(); pintarNav();
    if (passos()[est.passo] === REVISAR) pintarPasso();
    avisar(r.proposta.publicada !== false ? 'Salva e no ar: ' + location.origin + r.url : 'Salva como rascunho.');
  } catch (e) { avisar('Não salvou: ' + e.message, 'erro'); }
  finally { const b2 = $('#salvar'); if (b2) { b2.disabled = false; b2.textContent = 'Salvar'; } }
}

async function salvarModelo() {
  const b = $('#salvar'); if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
  try {
    const novo = {}; for (const k of CAMPOS_MODELO) if (est.proposta[k] !== undefined) novo[k] = est.proposta[k];
    await enviarJson('/api/modelo-proposta', 'PUT', novo);
    est.modelo = clonar(novo); est.salva = JSON.stringify(est.proposta);
    pintarEstado();
    avisar('Modelo salvo. Vale para as próximas propostas.');
  } catch (e) { avisar('Não salvou o modelo: ' + e.message, 'erro'); }
  finally { const b2 = $('#salvar'); if (b2) { b2.disabled = false; b2.textContent = 'Salvar modelo'; } }
}

async function salvarComoModelo() {
  if (!confirm('Os textos desta proposta (menos cliente, endereço e datas) passam a ser o padrão das próximas. Continuar?')) return;
  try {
    const novo = {}; for (const k of CAMPOS_MODELO) if (est.proposta[k] !== undefined) novo[k] = clonar(est.proposta[k]);
    await enviarJson('/api/modelo-proposta', 'PUT', novo);
    est.modelo = novo; avisar('Modelo atualizado a partir desta proposta.');
  } catch (e) { avisar('Não salvou o modelo: ' + e.message, 'erro'); }
}

/* ---------- imagens ---------- */
/* ---------- Preencher com IA ---------- */
let iaArquivos = [];
let iaLigada = null;   // null = ainda não perguntou ao servidor

async function abrirIa() {
  const dlg = $('#ia');
  if (iaLigada === null) {
    try { iaLigada = (await api('/api/proposta-ia')).ligada; } catch (e) { iaLigada = false; }
  }
  const aviso = $('#ia-aviso');
  aviso.hidden = true;
  $('#ia-meta').textContent = '';
  if (!iaLigada) {
    aviso.hidden = false; aviso.dataset.tipo = 'erro';
    aviso.textContent = 'A IA está desligada: defina OPENAI_API_KEY nas variáveis da stack no Portainer e atualize a stack. O botão volta a funcionar sozinho.';
  }
  pintarListaIa();
  dlg.showModal();
}

function pintarListaIa() {
  const ul = $('#ia-lista');
  ul.innerHTML = '';
  iaArquivos.forEach((f, i) => {
    const li = h('li', {},
      h('span', {}, f.name),
      h('small', {}, (f.size / 1024).toFixed(0) + ' KB'),
      h('button', { type: 'button', class: 'mini mini--perigo', title: 'Tirar', html: '&times;', onclick: () => { iaArquivos.splice(i, 1); pintarListaIa(); } }));
    ul.append(li);
  });
}

function juntarArquivos(lista) {
  for (const f of lista) {
    if (iaArquivos.some((x) => x.name === f.name && x.size === f.size)) continue;
    iaArquivos.push(f);
  }
  pintarListaIa();
}

async function preencherComIa() {
  const btn = $('#ia-enviar');
  const aviso = $('#ia-aviso');
  const texto = $('#ia-texto').value.trim();
  if (!texto && !iaArquivos.length) {
    aviso.hidden = false; aviso.dataset.tipo = 'erro'; aviso.textContent = 'Cole o texto da conversa ou anexe pelo menos um arquivo.';
    return;
  }
  const fd = new FormData();
  fd.append('proposta', JSON.stringify(est.proposta));
  fd.append('texto', texto);
  for (const f of iaArquivos) fd.append('arquivos', f, f.name);

  btn.disabled = true; btn.innerHTML = '<span class="girando"></span> Lendo e preenchendo…';
  aviso.hidden = false; aviso.dataset.tipo = ''; aviso.textContent = 'A IA está lendo o material. Costuma levar de 20 a 60 segundos.';
  try {
    const d = await api('/api/proposta-ia', { method: 'POST', body: fd });
    // Só o que veio de volta muda; o resto do estado continua o mesmo objeto.
    for (const k of ['cliente', 'id', 'preparadaPara', 'titulo', 'subtitulo', 'data', 'investimento', 'escopo', 'inclui', 'condicoes', 'faq']) {
      if (d.proposta[k] !== undefined) est.proposta[k] = d.proposta[k];
    }
    for (const ps of PASSOS) ps.montar(est.proposta, { novo: est.novo });
    est.visitados = new Set(passos().map((_, i) => i));
    pintarTopo(); pintarNav(); pintarPasso(); mudou();
    const lidos = (d.lidos || []).map((l) => l.nome + ' (' + l.como + ')').join(', ');
    aviso.dataset.tipo = 'ok';
    aviso.textContent = 'Preenchi: ' + (d.mudancas || []).join(', ') + '.'
      + (d.observacoes ? ' ' + d.observacoes : '')
      + ' Confira etapa por etapa antes de salvar.';
    $('#ia-meta').textContent = (lidos ? 'Lido: ' + lidos + '. ' : '') + 'Modelo: ' + (d.modelo || '');
    avisar('Proposta preenchida pela IA. Revise e salve.');
  } catch (e) {
    aviso.dataset.tipo = 'erro';
    aviso.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Preencher a proposta';
  }
}

function ligarIa() {
  const solta = $('#ia-solta'), input = $('#ia-arquivos');
  if (!solta) return;
  $('#ia-fechar').onclick = () => $('#ia').close();
  $('#ia-enviar').onclick = preencherComIa;
  solta.onclick = () => input.click();
  input.onchange = () => { juntarArquivos([...input.files]); input.value = ''; };
  solta.ondragover = (e) => { e.preventDefault(); solta.classList.add('ativa'); };
  solta.ondragleave = () => solta.classList.remove('ativa');
  solta.ondrop = (e) => { e.preventDefault(); solta.classList.remove('ativa'); juntarArquivos([...e.dataTransfer.files]); };
  // colar print direto na janela (Ctrl+V com imagem na área de transferência)
  $('#ia').addEventListener('paste', (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); juntarArquivos(imgs.map((f, i) => new File([f], 'print-' + (iaArquivos.length + i + 1) + '.png', { type: f.type }))); }
  });
}

/* ---------- perguntas ----------
   O briefing tem tela própria: /admin/perguntas/#<id da proposta>. */
const abrirPerguntas = (p) => { location.href = '/admin/perguntas/#' + encodeURIComponent(p.id); };

/* ---------- contrato ----------
   Uma janela só, em dois modos: o contrato de uma proposta e o
   modelo (cláusulas fixas + conta em reais). O texto é editável à
   mão; o PDF sai pela impressão da página /contratos/<id>. */
let ct = { modo: 'proposta', id: '', padrao: '' };

function ctAviso(txt, tipo = '') {
  const el = $('#ct-aviso');
  el.hidden = !txt; el.dataset.tipo = tipo; el.textContent = txt || '';
}

async function abrirContrato(p) {
  ct = { modo: 'proposta', id: p.id, padrao: '' };
  $('#ct-olho').textContent = 'Contrato';
  $('#ct-titulo').textContent = p.cliente || p.id;
  $('#ct-rotulo').textContent = 'Texto do contrato';
  $('#ct-dica').innerHTML = 'Gerado da proposta e, quando houver, da transcrição da reunião. As cláusulas vêm do modelo; a IA só identifica o cliente e lista os serviços. O que ninguém informou fica marcado com <b>[PREENCHER]</b>.';
  $('#ct-conta-campo').hidden = true;
  $('#ct-padrao').hidden = true;
  $('#ct-gerar').hidden = false;
  $('#ct-pdf').hidden = false;
  $('#ct-pdf').href = '/contratos/' + p.id;
  $('#ct-meta').textContent = '';
  ctAviso('');
  $('#ct-texto').value = '';
  $('#contrato').showModal();
  try {
    const c = await api('/api/contratos/' + encodeURIComponent(p.id));
    $('#ct-texto').value = c.texto || '';
    pintarMetaContrato(c);
    if (!c.texto) await gerarContrato();
  } catch (e) { ctAviso(e.message, 'erro'); }
}

function pintarMetaContrato(c) {
  $('#ct-meta').textContent = c.atualizadoEm ? 'Salvo em ' + new Date(c.atualizadoEm).toLocaleString('pt-BR') + (c.ia ? ' · IA: ' + c.ia : '') : '';
  if (c.avisos?.length) ctAviso(c.avisos.join(' '), 'erro');
}

async function gerarContrato() {
  if ($('#ct-texto').value.trim() && !confirm('Gerar de novo troca o texto atual. O que você editou à mão se perde. Continuar?')) return;
  const b = $('#ct-gerar');
  b.disabled = true; b.innerHTML = '<span class="girando"></span> Gerando…';
  ctAviso('Lendo a proposta e a reunião.');
  try {
    const c = await api('/api/contratos/' + encodeURIComponent(ct.id) + '/gerar', { method: 'POST' });
    $('#ct-texto').value = c.texto || '';
    ctAviso('');
    pintarMetaContrato(c);
    if (!c.avisos?.length) ctAviso('Contrato gerado. Confira antes de enviar.', 'ok');
  } catch (e) { ctAviso(e.message, 'erro'); }
  finally { b.disabled = false; b.textContent = 'Gerar de novo'; }
}

async function abrirModeloContrato() {
  ct = { modo: 'modelo', id: '', padrao: '' };
  $('#ct-olho').textContent = 'Modelo';
  $('#ct-titulo').textContent = 'Cláusulas de todo contrato';
  $('#ct-rotulo').textContent = 'Cláusulas fixas';
  $('#ct-dica').innerHTML = 'Vale para todo contrato novo. As marcas entre chaves, como <b>{{CONTRATANTE}}</b> e <b>{{SERVICOS}}</b>, são preenchidas na hora de gerar. Linha com marca sem valor some sozinha.';
  $('#ct-conta-campo').hidden = false;
  $('#ct-padrao').hidden = false;
  $('#ct-gerar').hidden = true;
  $('#ct-pdf').hidden = true;
  $('#ct-meta').textContent = '';
  ctAviso('');
  $('#ct-texto').value = '';
  $('#contrato').showModal();
  try {
    const m = await api('/api/modelo-contrato');
    ct.padrao = m.padrao || '';
    $('#ct-texto').value = m.texto || '';
    $('#ct-conta').value = m.contaReais || '';
  } catch (e) { ctAviso(e.message, 'erro'); }
}

async function salvarContrato() {
  const b = $('#ct-salvar');
  b.disabled = true; b.textContent = 'Salvando…';
  try {
    if (ct.modo === 'modelo') {
      await api('/api/modelo-contrato', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: $('#ct-texto').value, contaReais: $('#ct-conta').value }) });
      ctAviso('Modelo salvo. Vale para os próximos contratos.', 'ok');
    } else {
      const c = await api('/api/contratos/' + encodeURIComponent(ct.id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: $('#ct-texto').value }) });
      pintarMetaContrato(c);
      ctAviso('Contrato salvo.', 'ok');
    }
  } catch (e) { ctAviso(e.message, 'erro'); }
  finally { b.disabled = false; b.textContent = 'Salvar'; }
}

function ligarContrato() {
  if (!$('#contrato')) return;
  $('#ct-fechar').onclick = () => $('#contrato').close();
  $('#ct-salvar').onclick = salvarContrato;
  $('#ct-gerar').onclick = gerarContrato;
  $('#ct-padrao').onclick = () => {
    if (!ct.padrao || !confirm('Voltar as cláusulas para o texto padrão? O que você mudou se perde.')) return;
    $('#ct-texto').value = ct.padrao;
    ctAviso('Texto padrão carregado. Salve para valer.', 'ok');
  };
}

let resolver = null;
function escolherImagem() {
  pintarGaleria();
  $('#escolher').showModal();
  return new Promise((r) => { resolver = r; });
}
function fecharEscolher(url) { $('#escolher').close(); if (resolver) { resolver(url || null); resolver = null; } }
async function pintarGaleria() {
  const g = $('#galeria'); g.innerHTML = '';
  let imgs = [];
  try { imgs = (await api('/api/imagens')).imagens || []; } catch (e) { avisar('Não listei as imagens: ' + e.message, 'erro'); }
  $('#galeria-vazia').hidden = imgs.length > 0;
  for (const im of imgs) {
    g.append(h('button', { type: 'button', class: 'foto-adm', onclick: () => fecharEscolher(im.url) },
      h('img', { src: im.url, alt: '', loading: 'lazy' }),
      h('div', { class: 'foto-adm__pe' }, h('span', { class: 'foto-adm__nome' }, im.chave.split('/').pop()))));
  }
}
async function enviarImagens(arquivos) {
  let ultima = null;
  for (const a of arquivos) {
    const fd = new FormData(); fd.append('arquivo', a); fd.append('pasta', 'propostas');
    avisar('Enviando ' + a.name + '…');
    try { ultima = (await api('/api/imagens', { method: 'POST', body: fd })).url; }
    catch (e) { avisar('Falhou ' + a.name + ': ' + e.message, 'erro'); }
  }
  if (ultima) fecharEscolher(ultima); else pintarGaleria();
}
function ligarDialogo() {
  $('#escolher-fechar').onclick = () => fecharEscolher(null);
  $('#escolher').addEventListener('cancel', () => fecharEscolher(null));
  const solta = $('#solta'), arquivo = $('#arquivo');
  solta.onclick = () => arquivo.click();
  arquivo.onchange = () => { enviarImagens([...arquivo.files]); arquivo.value = ''; };
  solta.ondragover = (e) => { e.preventDefault(); solta.classList.add('ativa'); };
  solta.ondragleave = () => solta.classList.remove('ativa');
  solta.ondrop = (e) => { e.preventDefault(); solta.classList.remove('ativa'); enviarImagens([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); };
}
ctx.escolherImagem = escolherImagem;
ligarPassos({ mudou, escolherImagem });

/* ---------- geral ---------- */
async function sair() {
  if (suja() && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
  await fetch('/api/sair', { method: 'POST' });
  location.replace('/admin/entrar');
}
addEventListener('beforeunload', (e) => { if (suja()) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && est.modo !== 'lista') { e.preventDefault(); salvar(); }
});

ligarDialogo();
ligarContrato();
ligarIa();
await carregar();
const inicial = decodeURIComponent(location.hash.slice(1));
if (inicial && est.propostas.some((p) => p.id === inicial)) abrir(inicial);
else mostrarLista();
