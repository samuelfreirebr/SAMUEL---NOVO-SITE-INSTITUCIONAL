/* ============================================================
   Editor de propostas.

   Três colunas: à esquerda as etapas (uma por seção da página, na
   ordem em que o cliente lê), no meio o formulário só da etapa
   aberta, à direita a prévia ao vivo. Proposta nova começa na
   primeira etapa e segue com "Próxima"; todas já vêm preenchidas
   com o modelo.
   ============================================================ */

import { ctx, h, clonar, chave, ligarParte } from './ui.js';
import { PASSOS, ligarPassos } from './passos.js';

const $ = (s, r = document) => r.querySelector(s);

// O que pertence ao modelo (o que toda proposta nova já traz).
// Cliente, endereço, datas e situação são de cada proposta.
const CAMPOS_MODELO = ['titulo', 'subtitulo', 'validade', 'escopo', 'inclui', 'processo', 'investimento', 'pagamento',
  'condicoes', 'sobre', 'ecossistema', 'assinatura', 'encerramento', 'contato', 'faq', 'visivel'];

const REVISAR = { id: 'revisar', titulo: 'Revisar e salvar', resumo: 'Confira o que falta e publique.' };

/* ---------- estado ---------- */
const est = {
  modelo: {},
  propostas: [],
  proposta: null,
  salva: '',
  modo: 'lista',        // 'lista' | 'proposta' | 'modelo'
  novo: false,          // proposta ainda não salva nenhuma vez
  passo: 0,
  visitados: new Set(),
  previa: 'computador', // 'computador' | 'celular'
};
const suja = () => est.modo !== 'lista' && JSON.stringify(est.proposta) !== est.salva;
const passos = () => [...PASSOS.filter((p) => est.modo !== 'modelo' || !p.soProposta), REVISAR];
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
      h('button', { type: 'button', class: 'mini mini--ativo', onclick: nova }, '+ Nova proposta'));
  } else {
    sec.textContent = est.modo === 'modelo' ? 'Modelo' : (est.proposta.cliente || 'Nova proposta');
    acoes.append(...[
      h('button', { type: 'button', class: 'mini', onclick: voltarParaLista }, '← Propostas'),
      h('span', { class: 'ed-estado', id: 'estado' }),
      est.modo === 'proposta' && est.proposta.id && !est.novo
        && h('a', { class: 'mini', href: '/propostas/' + est.proposta.id, target: '_blank', rel: 'noopener' }, 'Abrir página'),
      h('button', { type: 'button', class: 'mini ed-so-estreito', onclick: alternarPrevia }, 'Prévia'),
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
    est.modelo = modelo; est.propostas = lista;
    ctx.icones = icones.icones || [];
    ctx.pistas = (icones.pistas || []).map(([src, flags, nome]) => [new RegExp(src, flags), nome]);
  } catch (e) { if (!/sessão/.test(e.message)) avisar('Não carreguei: ' + e.message, 'erro'); }
}

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
      h('button', { type: 'button', class: 'ed-prop__abrir', onclick: () => abrir(p.id) },
        h('span', { class: 'ed-prop__estado', 'data-ar': p.publicada ? '1' : '0' }, p.publicada ? 'No ar' : 'Rascunho'),
        h('b', { class: 'ed-prop__nome' }, p.cliente || p.id),
        h('span', { class: 'ed-prop__titulo' }, p.titulo || ''),
        h('span', { class: 'ed-prop__meta' }, '/propostas/' + p.id + (p.atualizadaEm ? ' · ' + new Date(p.atualizadaEm).toLocaleDateString('pt-BR') : ''))),
      h('div', { class: 'ed-prop__acoes' },
        h('button', { type: 'button', class: 'mini mini--ativo', onclick: () => abrir(p.id) }, 'Editar'),
        h('a', { class: 'mini', href: '/propostas/' + p.id, target: '_blank', rel: 'noopener' }, 'Ver'),
        h('button', { type: 'button', class: 'mini', onclick: async () => { try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch (e) { avisar(link); } } }, 'Copiar link'),
        h('button', { type: 'button', class: 'mini', onclick: () => duplicar(p.id) }, 'Duplicar'),
        h('button', { type: 'button', class: 'mini mini--perigo', onclick: () => apagar(p) }, 'Apagar')));
  });

  raiz.append(h('div', { class: 'ed-lista' },
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
  // Seção que a proposta não tem vem do modelo, como na página
  // pública: o editor mostra o que o cliente vê.
  // Igual ao comModelo() do servidor: seção ausente vem inteira;
  // objeto presente é completado campo a campo; listas não se misturam.
  if (modo === 'proposta') {
    const vazio = (v) => v === undefined || v === null || v === '';
    const objeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
    for (const k of CAMPOS_MODELO) {
      const padrao = est.modelo[k];
      if (padrao === undefined || k === 'visivel') continue;
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

  if (est.modo === 'modelo') {
    blocos.push(h('section', { class: 'ed-bloco' },
      h('p', { class: 'ed-bloco__dica' }, 'O modelo vale para as próximas propostas. As que já existem não mudam.')));
    return blocos;
  }

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
await carregar();
const inicial = decodeURIComponent(location.hash.slice(1));
if (inicial && est.propostas.some((p) => p.id === inicial)) abrir(inicial);
else mostrarLista();
