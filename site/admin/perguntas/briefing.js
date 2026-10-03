/* ============================================================
   Tela do briefing: editar as perguntas que o cliente vai receber.

   Fica em /admin/perguntas/#<id da proposta>. A IA monta o primeiro
   rascunho; aqui o Samuel edita, apaga, adiciona e liga ou desliga
   blocos inteiros (contrato, materiais, hospedagem, Google). O que
   está salvo é o que o cliente vê.
   ============================================================ */

import { h } from '../propostas/ui.js';

const $ = (s, r = document) => r.querySelector(s);

const id = decodeURIComponent(location.hash.slice(1));
const TIPOS = [
  ['texto', 'Resposta curta'], ['longo', 'Resposta longa'], ['escolha', 'Escolher uma'],
  ['varias', 'Escolher várias'], ['email', 'E-mail'], ['telefone', 'Telefone'],
  ['link', 'Link'], ['arquivo', 'Arquivos'],
];
// Sem estas quatro o contrato sai com [PREENCHER]: não dá para apagar.
const FIXAS = new Set(['razaoSocial', 'documento', 'endereco', 'email']);

let f = null;           // o formulário em edição
let salvo = '';         // JSON do último estado salvo
let proposta = null;

const suja = () => f && JSON.stringify(f.blocos) + f.titulo + f.texto !== salvo;
const marcar = () => (f.blocos && ($('#salvar').textContent = suja() ? 'Salvar alterações' : 'Salvo'));
const novoId = () => 'q-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  if (r.status === 401) { location.replace('/admin/entrar?voltar=' + encodeURIComponent(location.pathname + location.hash)); throw new Error('Faça login.'); }
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

/* ---------- carregar ---------- */
async function carregar() {
  if (!id) { $('#app').innerHTML = '<p class="vazio" style="padding:var(--sp-xl)">Abra o briefing pela lista de propostas.</p>'; return; }
  try {
    [f, proposta] = await Promise.all([
      api('/api/formularios/' + encodeURIComponent(id)),
      api('/api/propostas/' + encodeURIComponent(id)).catch(() => null),
    ]);
  } catch (e) { $('#app').textContent = e.message; return; }
  $('#topo-cliente').textContent = proposta?.cliente || id;
  document.title = 'Briefing ' + (proposta?.cliente || id) + ' | Painel';
  f.titulo ||= ''; f.texto ||= '';
  salvo = JSON.stringify(f.blocos) + f.titulo + f.texto;
  pintar();
}

/* ---------- a tela ---------- */
function pintar() {
  const app = $('#app');
  app.innerHTML = '';
  const aberto = new Set([...document.querySelectorAll('.br-q[open]')].map((e) => e.dataset.id));

  if (f.link) { $('#ver').href = '/perguntas/' + f.link; $('#ver').hidden = false; }
  $('#gerar').textContent = f.novo || !f.criadoEm ? 'Gerar com IA' : 'Gerar de novo com IA';

  app.append(
    h('div', { class: 'br-grade' },
      h('div', { class: 'br-col' }, cabecalho(), ...f.blocos.map(blocoEl), prontosQueFaltam(), novoBloco()),
      h('aside', { class: 'br-lado' }, ladoLink(), ladoResumo(), ladoRespostas(), ladoArquivos())));

  for (const e of document.querySelectorAll('.br-q')) if (aberto.has(e.dataset.id)) e.open = true;
  marcar();
}

function cabecalho() {
  const t = h('input', { type: 'text', value: f.titulo, placeholder: 'Título do briefing' });
  t.oninput = () => { f.titulo = t.value; marcar(); };
  const x = h('textarea', { rows: 3, placeholder: 'Texto de abertura que o cliente lê antes de começar' });
  x.value = f.texto;
  x.oninput = () => { f.texto = x.value; marcar(); };
  return h('section', { class: 'br-cab' },
    h('p', { class: 'eyebrow' }, 'Abertura'),
    h('label', { class: 'br-campo' }, h('span', {}, 'Título'), t),
    h('label', { class: 'br-campo' }, h('span', {}, 'Texto de abertura'), x),
    f.avisos?.length ? h('p', { class: 'br-aviso' }, f.avisos.join(' ')) : null);
}

/* ---------- bloco ---------- */
function blocoEl(b, bi) {
  const ligado = b.ligado !== false;
  const chave = h('input', { type: 'checkbox', role: 'switch' });
  chave.checked = ligado;
  chave.onchange = () => { b.ligado = chave.checked; pintar(); };

  const titulo = h('input', { type: 'text', value: b.titulo, class: 'br-bloco__titulo', 'aria-label': 'Nome do bloco' });
  titulo.oninput = () => { b.titulo = titulo.value; marcar(); };
  const texto = h('input', { type: 'text', value: b.texto || '', placeholder: 'Uma linha explicando por que perguntamos isso', class: 'br-bloco__texto', 'aria-label': 'Texto do bloco' });
  texto.oninput = () => { b.texto = texto.value; marcar(); };

  const n = (b.perguntas || []).length;
  const acoes = h('div', { class: 'br-bloco__acoes' },
    h('button', { type: 'button', class: 'mini', disabled: bi === 0, onclick: () => mover(f.blocos, bi, -1), 'aria-label': 'Subir bloco' }, '↑'),
    h('button', { type: 'button', class: 'mini', disabled: bi === f.blocos.length - 1, onclick: () => mover(f.blocos, bi, 1), 'aria-label': 'Descer bloco' }, '↓'),
    b.pronto ? null : h('button', { type: 'button', class: 'mini mini--perigo', onclick: () => { if (confirm('Apagar o bloco "' + b.titulo + '" e as ' + n + ' perguntas?')) { f.blocos.splice(bi, 1); pintar(); } } }, 'Apagar'));

  return h('section', { class: 'br-bloco' + (ligado ? '' : ' br-bloco--off') },
    h('header', { class: 'br-bloco__topo' },
      h('label', { class: 'br-chave', title: ligado ? 'O cliente vê este bloco' : 'O cliente não vê este bloco' },
        chave, h('span', { class: 'br-chave__trilho', 'aria-hidden': 'true' }),
        h('span', { class: 'br-chave__txt' }, ligado ? 'No briefing' : 'Desligado')),
      h('span', { class: 'br-bloco__n' }, String(bi + 1).padStart(2, '0')),
      b.pronto ? h('span', { class: 'br-selo' }, 'Pronto') : null,
      acoes),
    h('div', { class: 'br-bloco__cab' }, titulo, texto),
    ligado
      ? h('div', { class: 'br-qs' },
        ...(b.perguntas || []).map((q, qi) => perguntaEl(b, q, qi)),
        h('button', { type: 'button', class: 'br-add', onclick: () => { const q = { id: novoId(), pergunta: '', ajuda: '', exemplo: '', pular: false, tipo: 'texto', opcoes: [], obrigatoria: false }; b.perguntas.push(q); pintar(); const e = document.querySelector(`.br-q[data-id="${q.id}"]`); if (e) { e.open = true; e.querySelector('input')?.focus(); } } }, '+ Adicionar pergunta'))
      : h('p', { class: 'br-bloco__off' }, n + ' pergunta' + (n === 1 ? '' : 's') + ' guardada' + (n === 1 ? '' : 's') + '. Ligue para o cliente ver.'));
}

/* ---------- pergunta ---------- */
function perguntaEl(b, q, qi) {
  const fixa = b.pronto === 'contrato' && FIXAS.has(q.id);
  const ehEscolha = q.tipo === 'escolha' || q.tipo === 'varias';

  const enun = h('input', { type: 'text', value: q.pergunta, placeholder: 'Escreva a pergunta', 'aria-label': 'Pergunta' });
  enun.oninput = () => { q.pergunta = enun.value; resumoEl.textContent = enun.value || 'Pergunta sem texto'; marcar(); };

  const ajuda = h('input', { type: 'text', value: q.ajuda || '', placeholder: 'Exemplo ou instrução (opcional)', 'aria-label': 'Ajuda' });
  ajuda.oninput = () => { q.ajuda = ajuda.value; marcar(); };

  const exemplo = h('textarea', { rows: 3, placeholder: 'Resposta de exemplo, uma por linha (opcional)', 'aria-label': 'Exemplo' });
  exemplo.value = q.exemplo || '';
  exemplo.oninput = () => { q.exemplo = exemplo.value; marcar(); };

  const tipo = h('select', { 'aria-label': 'Tipo de resposta' }, ...TIPOS.map(([v, r]) => h('option', { value: v, selected: v === q.tipo }, r)));
  tipo.onchange = () => { q.tipo = tipo.value; if (!['escolha', 'varias'].includes(q.tipo)) q.opcoes = []; pintar(); };

  const obr = h('input', { type: 'checkbox' });
  obr.checked = !!q.obrigatoria; obr.disabled = fixa;
  obr.onchange = () => { q.obrigatoria = obr.checked; marcar(); };

  const pul = h('input', { type: 'checkbox' });
  pul.checked = !!q.pular;
  pul.onchange = () => { q.pular = pul.checked; marcar(); };

  const resumoEl = h('span', { class: 'br-q__t' }, q.pergunta || 'Pergunta sem texto');
  const tipoRot = TIPOS.find(([v]) => v === q.tipo)?.[1] || q.tipo;

  let opcoes = null;
  if (ehEscolha) {
    const t = h('textarea', { rows: 4, placeholder: 'Uma opção por linha' });
    t.value = (q.opcoes || []).join('\n');
    t.oninput = () => { q.opcoes = t.value.split('\n').map((x) => x.trim()).filter(Boolean); marcar(); };
    opcoes = h('label', { class: 'br-campo' }, h('span', {}, 'Opções'), t);
  }

  return h('details', { class: 'br-q', 'data-id': q.id },
    h('summary', {},
      h('span', { class: 'br-q__n' }, String(qi + 1).padStart(2, '0')),
      resumoEl,
      q.obrigatoria ? h('span', { class: 'br-obr' }, 'obrigatória') : null,
      h('span', { class: 'br-q__tipo' }, tipoRot),
      h('span', { class: 'br-q__seta', 'aria-hidden': 'true' }, '+')),
    h('div', { class: 'br-q__corpo' },
      h('label', { class: 'br-campo' }, h('span', {}, 'Pergunta'), enun),
      h('label', { class: 'br-campo' }, h('span', {}, 'Ajuda'), ajuda),
      h('label', { class: 'br-campo' }, h('span', {}, 'Exemplo para o cliente'), exemplo),
      h('div', { class: 'br-linha' },
        h('label', { class: 'br-campo' }, h('span', {}, 'Tipo de resposta'), tipo),
        h('div', { class: 'br-checks' },
          h('label', { class: 'br-check' }, obr, h('span', {}, fixa ? 'Obrigatória (o contrato precisa)' : 'Obrigatória')),
          h('label', { class: 'br-check' }, pul, h('span', {}, 'Pode pular e enviar depois pelo WhatsApp')))),
      opcoes,
      h('div', { class: 'br-q__acoes' },
        h('button', { type: 'button', class: 'mini', disabled: qi === 0, onclick: () => mover(b.perguntas, qi, -1) }, '↑ Subir'),
        h('button', { type: 'button', class: 'mini', disabled: qi === b.perguntas.length - 1, onclick: () => mover(b.perguntas, qi, 1) }, '↓ Descer'),
        fixa ? h('span', { class: 'br-nota' }, 'Fixa: preenche o contrato.')
          : h('button', { type: 'button', class: 'mini mini--perigo', onclick: () => { b.perguntas.splice(qi, 1); pintar(); } }, 'Apagar'))));
}

function mover(lista, i, d) {
  const j = i + d;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  pintar();
}

// Formulários antigos não têm os blocos prontos criados depois: um clique traz.
function prontosQueFaltam() {
  const tem = new Set(f.blocos.map((b) => b.id));
  const faltam = (f.prontos || []).filter((b) => !tem.has(b.id));
  if (!faltam.length) return h('span', { hidden: true });
  return h('div', { class: 'br-prontos' },
    h('p', { class: 'eyebrow' }, 'Blocos prontos para adicionar'),
    h('div', { class: 'br-prontos__lista' }, ...faltam.map((b) => h('button', {
      type: 'button', class: 'mini', title: b.texto,
      onclick: () => { f.blocos.push({ ...JSON.parse(JSON.stringify(b)), ligado: true }); pintar(); },
    }, '+ ' + b.titulo))));
}

function novoBloco() {
  return h('button', { type: 'button', class: 'br-add br-add--bloco', onclick: () => {
    f.blocos.push({ id: 'b-' + novoId(), ligado: true, titulo: 'Novo bloco', texto: '', perguntas: [{ id: novoId(), pergunta: '', ajuda: '', exemplo: '', pular: false, tipo: 'texto', opcoes: [], obrigatoria: false }] });
    pintar();
    document.querySelector('.br-bloco:last-of-type .br-bloco__titulo')?.select();
  } }, '+ Novo bloco de perguntas');
}

/* ---------- coluna lateral ---------- */
function ladoLink() {
  if (!f.link) {
    return h('section', { class: 'br-card' },
      h('p', { class: 'eyebrow' }, 'Link para o cliente'),
      h('p', { class: 'br-card__txt' }, 'O link nasce quando você salva pela primeira vez.'));
  }
  const url = location.origin + '/perguntas/' + f.link;
  const campo = h('input', { type: 'text', value: url, readonly: true, 'aria-label': 'Link do briefing' });
  return h('section', { class: 'br-card' },
    h('p', { class: 'eyebrow' }, 'Link para o cliente'),
    campo,
    h('div', { class: 'br-card__acoes' },
      h('button', { type: 'button', class: 'mini mini--ativo', onclick: async () => { try { await navigator.clipboard.writeText(url); avisar('Link copiado.'); } catch (e) { campo.select(); avisar('Copie o link selecionado.'); } } }, 'Copiar link'),
      h('a', { class: 'mini', href: url, target: '_blank', rel: 'noopener' }, 'Abrir')));
}

function ladoResumo() {
  const ativos = f.blocos.filter((b) => b.ligado !== false);
  const total = ativos.reduce((n, b) => n + (b.perguntas || []).filter((q) => q.pergunta).length, 0);
  return h('section', { class: 'br-card' },
    h('p', { class: 'eyebrow' }, 'O cliente vai ver'),
    h('p', { class: 'br-num' }, String(total), h('small', {}, ' perguntas')),
    h('ul', { class: 'br-resumo' }, ...f.blocos.map((b) => h('li', { class: b.ligado === false ? 'off' : '' },
      h('span', {}, b.titulo), h('b', {}, b.ligado === false ? 'desligado' : String((b.perguntas || []).filter((q) => q.pergunta).length))))),
    f.ia ? h('p', { class: 'br-nota' }, 'IA: ' + f.ia) : null);
}

// Linha de arquivo guardada como "nome (url)"
const ARQ = /^(.+?) \((https?:\/\/[^)\s]+)\)$/;

function ladoRespostas() {
  if (!f.respondidoEm) {
    return h('section', { class: 'br-card' },
      h('p', { class: 'eyebrow' }, 'Respostas'),
      h('p', { class: 'br-card__txt' }, f.link ? 'O cliente ainda não respondeu.' : 'Salve e mande o link.'));
  }
  const itens = f.blocos.flatMap((b) => (b.perguntas || []).filter((q) => f.respostas?.[q.id]).map((q) => ({ q, r: f.respostas[q.id] })));
  return h('section', { class: 'br-card br-card--resp' },
    h('p', { class: 'eyebrow' }, 'Respostas'),
    h('p', { class: 'br-nota' }, 'Recebido em ' + new Date(f.respondidoEm).toLocaleString('pt-BR')),
    ...itens.map(({ q, r }) => h('div', { class: 'br-resp' },
      h('b', {}, q.pergunta),
      h('p', {}, ...String(r).split('\n').flatMap((linha, i) => {
        const m = ARQ.exec(linha);
        return [i ? h('br') : null, m ? h('a', { href: m[2], target: '_blank', rel: 'noopener' }, m[1]) : linha];
      })))));
}

function ladoArquivos() {
  if (!f.anexos?.length) return h('span', { hidden: true });
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  return h('section', { class: 'br-card' },
    h('p', { class: 'eyebrow' }, 'Arquivos enviados'),
    h('ul', { class: 'br-arqs' }, ...f.anexos.map((a) => h('li', {},
      h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.nome), h('small', {}, kb(a.tamanho))))));
}

/* ---------- salvar e gerar ---------- */
async function salvar() {
  const b = $('#salvar');
  b.disabled = true;
  try {
    const d = await api('/api/formularios/' + encodeURIComponent(id), {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titulo: f.titulo, texto: f.texto, blocos: f.blocos }),
    });
    f = { ...f, ...d, novo: false };
    salvo = JSON.stringify(f.blocos) + f.titulo + f.texto;
    pintar();
    avisar('Briefing salvo.');
  } catch (e) { avisar(e.message, 'erro'); }
  finally { b.disabled = false; marcar(); }
}

async function gerar() {
  if (f.criadoEm && !confirm('Gerar de novo troca tudo o que está aqui pelo que a IA montar. Continuar?')) return;
  const b = $('#gerar');
  b.disabled = true; b.textContent = 'Montando…';
  try {
    const d = await api('/api/formularios/' + encodeURIComponent(id) + '/gerar', { method: 'POST' });
    f = { ...d, anexos: f.anexos, prontos: f.prontos };
    salvo = JSON.stringify(f.blocos) + f.titulo + f.texto;
    pintar();
    avisar(d.avisos?.length ? d.avisos.join(' ') : 'Briefing montado. Revise, edite e mande o link.', d.avisos?.length ? 'erro' : 'ok');
  } catch (e) { avisar(e.message, 'erro'); }
  finally { b.disabled = false; $('#gerar').textContent = 'Gerar de novo com IA'; }
}

$('#salvar').onclick = salvar;
$('#gerar').onclick = gerar;
addEventListener('beforeunload', (e) => { if (suja()) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); salvar(); } });
carregar();
