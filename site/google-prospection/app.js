/* ============================================================
   Prospecção: o comportamento da tela.

   Quatro abas, sem roteador: a aba ativa é um atributo no
   <main>. O estado mora em variáveis soltas aqui em cima, é
   uma tela só, para uma pessoa só, e isso basta.

   Tudo que vem de fora (nome de negócio, endereço, bio, título
   de site, resumo de vaga) passa por esc() antes de virar HTML.
   Um negócio chamado <img onerror=…> não pode rodar código na
   sessão do painel.
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const num = (n) => Number(n || 0).toLocaleString('pt-BR');

/* ---------- API ---------- */
async function api(url, opcoes) {
  const r = await fetch(url, opcoes);
  const texto = await r.text();
  let dado;
  try { dado = JSON.parse(texto); }
  catch (e) { throw new Error('o servidor respondeu algo que não é JSON.'); }
  if (r.status === 401) { location.replace('/admin/entrar?voltar=' + encodeURIComponent('/google-prospection/')); throw new Error('sessão encerrada'); }
  if (!r.ok) throw new Error(dado.erro || ('erro ' + r.status));
  return dado;
}
const enviar = (url, metodo, corpo) => api(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

function avisar(texto, tipo = 'ok') {
  const el = $('#aviso');
  el.textContent = texto; el.dataset.tipo = tipo; el.classList.add('mostra');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove('mostra'), tipo === 'ok' ? 3200 : 6000);
}
async function copiar(texto, msg = 'Copiado.') {
  try { await navigator.clipboard.writeText(texto); avisar(msg); }
  catch (e) { prompt('Copie:', texto); }
}

/* ---------- estado ---------- */
let CONFIG = { mapas: 'osm', ia: false, instagram: false, pagespeedKey: '', nichos: [], grupos: [], paises: [] };
let PERFIL = { nome: 'Samuel Freire', faz: 'sites', cidade: '', zap: '' };
let RESULTADOS = [];          // negócios da última varredura
let CTX = {};                 // { termo, nicho, cidade, pais, fonte }
let FILTRO = 'todos';
let MODO = 'cidade';          // perto | cidade | brasil
let CIDADE_SEL = null;        // { rotulo, lat, lon }
let LEADS = [];
const DIAG = {};              // índice → diagnóstico do site
const MSG = {};               // índice → { texto, versao, ia, pt }
const VERIF = {};             // índice → o que a busca na web achou
let INSTA = [];
let FILTRO_INSTA = 'vale';
let FILTRO_LEADS = 'ativos';

const CHAVE_BUSCA = 'prospeccao-ultima-busca';
const CHAVE_ABA = 'prospeccao-aba';

/* ============================================================
   Abas
   ============================================================ */
function irPara(aba) {
  $$('.abas [data-aba]').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === aba ? 'true' : 'false'));
  $$('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== aba; });
  try { localStorage.setItem(CHAVE_ABA, aba); } catch (e) { /* sem storage */ }
  if (aba === 'lista') pintarBoard();
  window.scrollTo({ top: 0, behavior: SEM_MOVIMENTO ? 'auto' : 'smooth' });
}
$$('.abas [data-aba]').forEach((b) => { b.onclick = () => irPara(b.dataset.aba); });

$('#sair').onclick = async () => {
  await fetch('/api/sair', { method: 'POST' });
  location.replace('/admin/entrar');
};

/* ============================================================
   Perfil: quem assina
   ============================================================ */
const dlgPerfil = $('#perfil');
$('#perfil-abrir').onclick = () => {
  $('#pf-nome').value = PERFIL.nome || '';
  $('#pf-faz').value = PERFIL.faz || 'sites';
  $('#pf-cidade').value = PERFIL.cidade || '';
  $('#pf-zap').value = PERFIL.zap || '';
  dlgPerfil.showModal();
};
$('#perfil-fechar').onclick = () => dlgPerfil.close();
$('#form-perfil').onsubmit = async (e) => {
  e.preventDefault();
  try {
    PERFIL = await enviar('/api/prospeccao/perfil', 'PUT', {
      nome: $('#pf-nome').value.trim(), faz: $('#pf-faz').value, cidade: $('#pf-cidade').value.trim(), zap: $('#pf-zap').value.trim(),
    });
    dlgPerfil.close();
    avisar('Perfil salvo. As próximas mensagens já saem assinadas.');
    // mensagens de template já geradas ganham a assinatura nova
    Object.keys(MSG).forEach((i) => { if (!MSG[i].ia) { gerarMensagem(Number(i), MSG[i].versao); } });
  } catch (x) { avisar('Não salvei: ' + x.message, 'erro'); }
};

/* ============================================================
   Busca: "Quem está no mapa"
   ============================================================ */
const form = $('#form-busca');
const inNicho = $('#nicho'), inTermo = $('#termo'), inPais = $('#pais'), inCidade = $('#cidade'), inRaio = $('#raio');
const sugestoes = $('#sugestoes');

function montarSelects() {
  // Com mais de cem nichos, a lista solta vira rolagem sem fim:
  // cada grupo vira um bloco com título.
  const opcao = (n) => `<option value="${esc(n.id)}">${esc(n.pt)}</option>`;
  const agrupados = new Set();
  let html = (CONFIG.grupos || []).map(([g, rotulo]) => {
    const dentro = CONFIG.nichos.filter((n) => n.g === g);
    dentro.forEach((n) => agrupados.add(n.id));
    return dentro.length ? `<optgroup label="${esc(rotulo)}">${dentro.map(opcao).join('')}</optgroup>` : '';
  }).join('');
  html += CONFIG.nichos.filter((n) => !agrupados.has(n.id)).map(opcao).join('');
  inNicho.innerHTML = html + '<option value="outro">Outro nicho, eu escrevo</option>';
  inPais.innerHTML = CONFIG.paises.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
  inPais.value = 'br';
  $('#fonte-dados').innerHTML = CONFIG.mapas === 'google'
    ? 'Dados do <b>Google Maps</b>: nota, avaliações e opiniões.'
    : 'Sem chave do Google: dados do <b>OpenStreetMap</b>, sem nota nem avaliações. Defina <code>GOOGLE_PLACES_KEY</code> na stack pra ligar o Google.';
}

inNicho.onchange = () => { $('#l-termo').hidden = inNicho.value !== 'outro'; if (inNicho.value === 'outro') inTermo.focus(); };

inPais.onchange = () => {
  // Trocar o país limpa a cidade: a lista de sugestões é por país.
  inCidade.value = ''; CIDADE_SEL = null; inCidade.dataset.ok = '';
  inCidade.placeholder = inPais.value === 'br' ? 'Ex: Curitiba' : inPais.value === 'us' ? 'Ex: Austin, TX' : 'Ex: Lisboa';
};

$$('.modos [data-modo]').forEach((b) => {
  b.onclick = () => setModo(b.dataset.modo);
});
function setModo(m) {
  MODO = m;
  $$('.modos [data-modo]').forEach((x) => x.setAttribute('aria-checked', x.dataset.modo === m ? 'true' : 'false'));
  $('#l-cidade').hidden = m !== 'cidade';
  $('#l-raio').hidden = m === 'brasil';
  $('#pais').closest('label').hidden = m === 'brasil';
  if (m === 'brasil') inPais.value = 'br';
  $('#varrer').firstChild.textContent = m === 'brasil' ? 'Varrer o Brasil ' : m === 'perto' ? 'Varrer perto de mim ' : 'Varrer a região ';
}

/* autocomplete de cidade: 3 letras, 400 ms, escolher da lista manda lat/lon */
let sugIdx = -1;
const buscarCidades = debounce(async () => {
  const q = inCidade.value.trim();
  if (q.length < 3) { sugestoes.hidden = true; return; }
  try {
    const d = await api(`/api/prospeccao/cidades?pais=${encodeURIComponent(inPais.value)}&q=${encodeURIComponent(q)}`);
    if (inCidade.value.trim() !== q) return;   // já digitou mais
    sugestoes.innerHTML = (d.cidades || []).map((c) => `<li data-lat="${c.lat}" data-lon="${c.lon}">${esc(c.rotulo)}</li>`).join('');
    sugestoes.hidden = !d.cidades?.length;
    sugIdx = -1;
    $$('li', sugestoes).forEach((li) => { li.onmousedown = (e) => { e.preventDefault(); escolherCidade(li); }; });
  } catch (e) { sugestoes.hidden = true; }
}, 400);
function escolherCidade(li) {
  CIDADE_SEL = { rotulo: li.textContent, lat: Number(li.dataset.lat), lon: Number(li.dataset.lon) };
  inCidade.value = CIDADE_SEL.rotulo; inCidade.dataset.ok = '1';
  sugestoes.hidden = true;
}
inCidade.oninput = () => { CIDADE_SEL = null; inCidade.dataset.ok = ''; buscarCidades(); };
inCidade.onblur = () => setTimeout(() => { sugestoes.hidden = true; }, 150);
inCidade.onkeydown = (e) => {
  const itens = $$('li', sugestoes);
  if (sugestoes.hidden || !itens.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
    itens.forEach((li, i) => li.setAttribute('aria-selected', i === sugIdx ? 'true' : 'false'));
  } else if (e.key === 'Enter' && sugIdx >= 0) { e.preventDefault(); escolherCidade(itens[sugIdx]); }
  else if (e.key === 'Escape') sugestoes.hidden = true;
};

function posicao() {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error('Este navegador não dá a localização.'));
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => falha(new Error('Não consegui sua localização. Libere no navegador ou busque por cidade.')), { timeout: 10000, maximumAge: 300000 });
  });
}

form.onsubmit = async (e) => {
  e.preventDefault();
  const nicho = inNicho.value;
  const termo = inTermo.value.trim();
  if (nicho === 'outro' && !termo) { inTermo.focus(); return avisar('Escreva o nicho.', 'erro'); }
  const q = new URLSearchParams();
  if (nicho !== 'outro') q.set('nicho', nicho); else q.set('termo', termo);
  q.set('pais', inPais.value);
  q.set('raio', inRaio.value);
  const rotuloNicho = nicho === 'outro' ? termo : inNicho.selectedOptions[0].textContent;

  try {
    if (MODO === 'brasil') q.set('modo', 'brasil');
    else if (MODO === 'perto') {
      log('pedindo sua localização ao navegador…');
      const p = await posicao();
      q.set('lat', p.lat.toFixed(5)); q.set('lon', p.lon.toFixed(5));
    } else {
      const cidade = inCidade.value.trim();
      if (!cidade) { inCidade.focus(); return avisar('Diga a cidade.', 'erro'); }
      if (CIDADE_SEL) { q.set('lat', CIDADE_SEL.lat); q.set('lon', CIDADE_SEL.lon); q.set('cidade', CIDADE_SEL.rotulo); }
      else q.set('cidade', cidade);
    }
  } catch (x) { return avisar(x.message, 'erro'); }

  varreOn(true);
  limparLog();
  log(`varrendo <b>${esc(rotuloNicho.toLowerCase())}</b> ${MODO === 'brasil' ? 'nas 10 capitais' : MODO === 'perto' ? 'perto de você' : 'em <b>' + esc(inCidade.value.trim()) + '</b>'}…`);
  $('#varrer').disabled = true;
  try {
    const d = await api('/api/prospeccao/buscar?' + q.toString());
    CTX = { termo: rotuloNicho, nicho, grupo: d.grupo || '', nichoNome: d.nichoNome || rotuloNicho, cidade: d.lugar?.nome || '', pais: inPais.value, fonte: d.fonte, quando: Date.now() };
    receber(d);
    guardarBusca(d);
  } catch (x) {
    varreOn(false);
    log(`<i>falhou:</i> ${esc(x.message)}`);
    avisar('A varredura falhou: ' + x.message, 'erro');
  } finally { $('#varrer').disabled = false; }
};

function receber(d, rolar = true) {
  RESULTADOS = d.lista || [];
  Object.keys(DIAG).forEach((k) => delete DIAG[k]);
  Object.keys(MSG).forEach((k) => delete MSG[k]);
  Object.keys(VERIF).forEach((k) => delete VERIF[k]);
  log(`localizado: <b>${esc(d.lugar?.nome || '')}</b>${d.pracas ? ' · ' + d.pracas + ' praças' : ''}`);
  log(`encontrados: <b>${d.total}</b> · <i>${d.semSite} sem site</i> · ${d.comFone} com telefone`);
  varreOn(false, RESULTADOS);
  $('#resultado').hidden = false;
  pintarKpis();
  pintarCards();
  digitar($('#saida'), `${d.total} negócios em ${d.lugar?.nome || 'região'} · ${d.semSite} sem site · ${d.comFone} com telefone · fonte: ${d.fonte === 'google' ? 'Google Maps' : 'OpenStreetMap'}`);
  if (rolar && !SEM_MOVIMENTO) setTimeout(() => $('#resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
}

/* última busca fica no navegador por 7 dias: volta de graça */
function guardarBusca(d) {
  try {
    localStorage.setItem(CHAVE_BUSCA, JSON.stringify({
      quando: Date.now(), dados: d, ctx: CTX,
      form: { modo: MODO, nicho: inNicho.value, termo: inTermo.value, pais: inPais.value, cidade: inCidade.value, raio: inRaio.value, sel: CIDADE_SEL },
    }));
  } catch (e) { /* storage cheio ou bloqueado: sem drama */ }
}
function restaurarBusca() {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE_BUSCA) || 'null');
    if (!g || Date.now() - g.quando > 7 * 86400000) return false;
    const f = g.form || {};
    setModo(f.modo || 'cidade');
    if (f.nicho) inNicho.value = f.nicho;
    inNicho.onchange();
    inTermo.value = f.termo || '';
    if (f.pais) inPais.value = f.pais;
    inCidade.value = f.cidade || ''; CIDADE_SEL = f.sel || null; inCidade.dataset.ok = CIDADE_SEL ? '1' : '';
    if (f.raio) inRaio.value = f.raio;
    CTX = g.ctx || {};
    limparLog();
    log(`última varredura restaurada (${new Date(g.quando).toLocaleDateString('pt-BR')})`);
    receber(g.dados, false);
    return true;
  } catch (e) { return false; }
}

/* ---------- log de terminal ---------- */
const elLog = $('#log');
function limparLog() { elLog.innerHTML = ''; }
function log(html) {
  const linhas = elLog.innerHTML ? elLog.innerHTML.split('\n') : [];
  linhas.push('&gt; ' + html);
  elLog.innerHTML = linhas.slice(-6).join('\n');
}

/* efeito de digitação na barra de saída */
function digitar(el, texto) {
  clearInterval(digitar.t);
  if (SEM_MOVIMENTO) { el.textContent = texto; return; }
  let i = 0; el.textContent = '';
  digitar.t = setInterval(() => { el.textContent = texto.slice(0, ++i); if (i >= texto.length) clearInterval(digitar.t); }, 14);
}

/* ============================================================
   Radar: gira enquanto o servidor não responde; ao responder
   para e desenha os pontos (vermelho = sem site)
   ============================================================ */
const radar = $('#radar');
const ctx = radar.getContext('2d');
let girando = false, angulo = 0, pontos = [], rafId = 0;

function prepararCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const lado = radar.clientWidth || 360;
  radar.width = lado * dpr; radar.height = lado * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return lado;
}
function desenharRadar() {
  const lado = prepararCanvas();
  const c = lado / 2, R = lado / 2 - 8;
  ctx.clearRect(0, 0, lado, lado);
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
  for (const f of [.25, .5, .75, 1]) { ctx.beginPath(); ctx.arc(c, c, R * f, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
  if (girando) {
    const g = ctx.createConicGradient(angulo, c, c);
    g.addColorStop(0, 'rgba(255,79,24,.55)'); g.addColorStop(.18, 'rgba(255,79,24,0)'); g.addColorStop(1, 'rgba(255,79,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,79,24,.9)'; ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(angulo) * R, c + Math.sin(angulo) * R); ctx.stroke();
  }
  for (const p of pontos) {
    ctx.fillStyle = p.sem ? '#FF4F18' : 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(c + Math.cos(p.a) * p.r * R, c + Math.sin(p.a) * p.r * R, p.sem ? 3.2 : 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#FF4F18'; ctx.beginPath(); ctx.arc(c, c, 3, 0, Math.PI * 2); ctx.fill();
}
function animar() { angulo += .05; desenharRadar(); if (girando) rafId = requestAnimationFrame(animar); }
function varreOn(liga, lista) {
  girando = liga && !SEM_MOVIMENTO;
  cancelAnimationFrame(rafId);
  if (liga) { pontos = []; if (girando) animar(); else desenharRadar(); return; }
  if (lista) {
    // até 44 pontos, espalhados por área (√aleatório), na proporção real de sem-site
    const n = Math.min(44, lista.length);
    const sem = Math.round(n * (lista.filter((x) => x.semSite).length / Math.max(1, lista.length)));
    pontos = Array.from({ length: n }, (_, i) => ({ r: Math.sqrt(Math.random()) * .92 + .04, a: Math.random() * Math.PI * 2, sem: i < sem }));
  }
  desenharRadar();
}
window.addEventListener('resize', debounce(desenharRadar, 120));

/* ============================================================
   Lista de negócios
   ============================================================ */
/* ---------- ícones ----------
   Desenho no próprio arquivo: sem fonte de ícone, sem pedido de
   rede. Tudo herda a cor de quem está em volta (currentColor). */
const ICO = {
  fone: '<path d="M3 4.5C3 3.7 3.7 3 4.5 3h1.6c.6 0 1.1.4 1.3 1l.6 2c.1.5 0 1-.4 1.3l-1 .8a9 9 0 0 0 4 4l.8-1c.3-.4.8-.5 1.3-.4l2 .6c.6.2 1 .7 1 1.3v1.6c0 .8-.7 1.5-1.5 1.5A11.5 11.5 0 0 1 3 4.5Z"/>',
  zap: '<path d="M8 13.5c3.3 0 6-2.3 6-5.2S11.3 3 8 3 2 5.3 2 8.3c0 1.2.5 2.3 1.3 3.2L2.6 14l2.8-.8c.8.2 1.7.3 2.6.3Z"/>',
  email: '<path d="M2.5 4h11v8h-11z"/><path d="m2.8 4.5 5.2 4 5.2-4"/>',
  site: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.6 1.7 2.4 3.5 2.4 5.5S9.6 12.3 8 13.5C6.4 12.3 5.6 10 5.6 8S6.4 4.2 8 2.5Z"/>',
  rede: '<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="3"/><circle cx="8" cy="8" r="2.4"/><circle cx="11.2" cy="4.8" r=".7" fill="currentColor" stroke="none"/>',
  mapa: '<path d="M8 14s4.5-4.2 4.5-7.1A4.5 4.5 0 0 0 3.5 6.9C3.5 9.8 8 14 8 14Z"/><circle cx="8" cy="6.8" r="1.7"/>',
  relogio: '<circle cx="8" cy="8" r="5.5"/><path d="M8 4.8v3.4l2.2 1.3"/>',
  foto: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="m3.5 11 2.7-2.7 2.2 2.2 2-2 2.6 2.6"/><circle cx="6" cy="6.4" r="1"/>',
  estrela: '<path d="m8 2.6 1.7 3.5 3.8.6-2.8 2.6.7 3.8L8 11.3l-3.4 1.8.7-3.8-2.8-2.6 3.8-.6Z"/>',
  prova: '<path d="M6.2 4.6c-1.9 0-3.4 1.4-3.4 3.2s1.3 2.9 2.9 2.9c-.2 1-.9 1.8-2 2.3M13.4 4.6c-1.9 0-3.4 1.4-3.4 3.2s1.3 2.9 2.9 2.9c-.2 1-.9 1.8-2 2.3"/>',
  alerta: '<path d="M8 2.6 14 13H2Z"/><path d="M8 6.4v3.1"/><circle cx="8" cy="11.3" r=".7" fill="currentColor" stroke="none"/>',
  ok: '<path d="m3.2 8.4 3.2 3.2L12.8 5"/>',
  falta: '<circle cx="8" cy="8" r="5.5" stroke-dasharray="2.4 2"/><path d="M5.6 8h4.8"/>',
  mais: '<path d="M8 13V3.6M4.4 7.2 8 3.6l3.6 3.6"/>',
  menos: '<path d="M8 3v9.4M4.4 8.8 8 12.4l3.6-3.6"/>',
  busca: '<circle cx="7.2" cy="7.2" r="4.3"/><path d="m10.4 10.4 3.2 3.2"/>',
  escudo: '<path d="m8 2.5 5 1.7v3.9c0 3-2.1 4.9-5 5.8-2.9-.9-5-2.8-5-5.8V4.2Z"/>',
  lista: '<path d="M5.6 4.4h8M5.6 8h8M5.6 11.6h8"/><circle cx="3" cy="4.4" r=".8" fill="currentColor" stroke="none"/><circle cx="3" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="3" cy="11.6" r=".8" fill="currentColor" stroke="none"/>',
  agenda: '<rect x="2.5" y="3.4" width="11" height="10.1" rx="1.5"/><path d="M2.5 6.4h11M5.4 2.3v2.2M10.6 2.3v2.2"/>',
  preco: '<path d="M7.6 2.6H13v5.4l-5.7 5.7a1.1 1.1 0 0 1-1.5 0L2.3 9.2a1.1 1.1 0 0 1 0-1.5Z"/><circle cx="10.4" cy="5.2" r=".9"/>',
  orcamento: '<path d="M4 2.6h5l3.1 3.1v8.3H4Z"/><path d="M8.9 2.6v3.2h3.2M6 9h4M6 11.2h2.8"/>',
  tela: '<rect x="2.4" y="3" width="11.2" height="8" rx="1.4"/><path d="M6 13.4h4M2.4 5.6h11.2"/>',
  antes: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.4"/><path d="M8 3.5v9"/><path d="M4.4 10.4 6 8.6l1.2 1.2M9 9.8l1.4-1.6 1.4 1.6"/>',
  raio: '<path d="M9.2 2.4 4 9.1h3.3l-.7 4.5L12 6.9H8.6Z"/>',
  google: '<circle cx="8" cy="8" r="5.5"/><path d="M8 8h3.7a3.7 3.7 0 1 1-1.1-2.6"/>',
  conserto: '<path d="M10.6 2.6a3.6 3.6 0 0 0-3.2 5.1l-4.7 4.7 1.8 1.8 4.7-4.7a3.6 3.6 0 1 0 1.4-6.9Z"/>',
  citacao: '<path d="M6.2 4.6c-1.9 0-3.4 1.4-3.4 3.2s1.3 2.9 2.9 2.9c-.2 1-.9 1.8-2 2.3M13.4 4.6c-1.9 0-3.4 1.4-3.4 3.2s1.3 2.9 2.9 2.9c-.2 1-.9 1.8-2 2.3"/>',
  etiqueta: '<path d="M7.6 2.6H13v5.4l-5.7 5.7a1.1 1.1 0 0 1-1.5 0L2.3 9.2a1.1 1.1 0 0 1 0-1.5Z"/><circle cx="10.4" cy="5.2" r=".9"/>',
  cardapio: '<path d="M3 3.2h3.6c.8 0 1.4.6 1.4 1.4v8.2a1.4 1.4 0 0 0-1.4-1.1H3ZM13 3.2H9.4c-.8 0-1.4.6-1.4 1.4v8.2a1.4 1.4 0 0 1 1.4-1.1H13Z"/>',
  equipe: '<circle cx="6" cy="5.4" r="2.2"/><path d="M2.6 13c0-2 1.5-3.4 3.4-3.4S9.4 11 9.4 13M10.8 4.2a1.9 1.9 0 0 1 0 3.6M11.4 9.8c1.3.3 2 1.3 2 2.6"/>',
  diretorio: '<rect x="2.5" y="2.6" width="11" height="10.8" rx="1.4"/><path d="M5.2 5.6h5.6M5.2 8h5.6M5.2 10.4h3.2"/>',
};
const ico = (nome, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICO[nome] || ICO.lista}</svg>`;

const TAG = (x) => x.semNada ? ['tag--fogo', 'sem site e sem rede']
  : x.diretorio ? ['tag--fogo', 'só ficha de diretório']
    : x.soRede ? ['tag--fogo', 'só rede social']
      : ['tag--ambar', 'site pra avaliar'];
const ROTULO = (x) => x.semSite ? 'criar do zero' : 'refazer o site';

// A nota vem do servidor, com os motivos junto. Depois do
// diagnóstico do site e da busca na web ela é recalculada lá.
const scoreDe = (i) => Number(RESULTADOS[i]?.score) || 0;
const faixaScore = (s) => s >= 70 ? 'alta' : s >= 45 ? 'media' : 'baixa';

/* Manda o negócio de volta com o que o navegador descobriu e recebe
   nota, motivos, perfil do Google e plano recalculados. */
async function recalcular(i) {
  const x = RESULTADOS[i];
  try {
    const d = await enviar('/api/prospeccao/pontuar', 'POST', {
      negocio: { ...x, diag: DIAG[i] || null, achado: VERIF[i] || null, verificado: VERIF[i]?.estado || '' },
      ctx: { nicho: CTX.nicho, grupo: CTX.grupo, cidade: CTX.cidade, nichoNome: CTX.nichoNome },
    });
    x.score = d.score; x.porque = d.porque || []; x.perfil = d.perfil || x.perfil; x.plano = d.plano || x.plano;
  } catch (e) { /* fica com a nota da varredura */ }
  atualizarScore(i);
  pintarPorque(i);
  pintarPerfil(i);
  pintarPlano(i);
}

const capenga = (x) => ((x.perfil?.faltas || 0) + (x.perfil?.ruins || 0)) >= 3;

function passaFiltro(i) {
  const x = RESULTADOS[i];
  if (FILTRO === 'sem') return x.semSite;
  if (FILTRO === 'com') return !x.semSite;
  if (FILTRO === 'quente') return scoreDe(i) >= 70;
  if (FILTRO === 'fone') return Boolean(x.fone || x.whatsapp || x.email);
  if (FILTRO === 'perfil') return capenga(x);
  return true;
}

function pintarKpis() {
  $('#k-total').textContent = num(RESULTADOS.length);
  $('#k-sem').textContent = num(RESULTADOS.filter((x) => x.semSite).length);
  $('#k-quentes').textContent = num(RESULTADOS.filter((_, i) => scoreDe(i) >= 70).length);
  $('#k-fone').textContent = num(RESULTADOS.filter((x) => x.fone || x.whatsapp || x.email).length);
  const el = $('#k-perfil');
  if (el) el.textContent = num(RESULTADOS.filter(capenga).length);
}

$$('.filtros [data-filtro]').forEach((b) => {
  b.onclick = () => {
    FILTRO = b.dataset.filtro;
    $$('.filtros [data-filtro]').forEach((x) => x.setAttribute('aria-checked', x.dataset.filtro === FILTRO ? 'true' : 'false'));
    aplicarFiltro();
  };
});
function aplicarFiltro() {
  let visiveis = 0;
  $$('#cards .card').forEach((c) => { const ok = passaFiltro(Number(c.dataset.i)); c.hidden = !ok; if (ok) visiveis++; });
  $('#cards-vazio').hidden = visiveis > 0;
}

/* ---------- todas as formas de contato ----------
   Junta o que veio do mapa, o que estava escrito no site e o que a
   busca na web achou. Cada um diz de onde saiu, porque telefone de
   site vale mais que telefone de ficha desatualizada. */
const dominio = (u) => { try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch (e) { return String(u || '').slice(0, 30); } };
const NOME_REDE = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', x: 'X' };
const ORIGEM = { mapa: 'do mapa', site: 'lido no site', web: 'achado na web' };

function contatosDe(i) {
  const x = RESULTADOS[i] || {};
  const c = DIAG[i]?.contatos || {};
  const v = VERIF[i] || {};
  const saida = [];
  const vistos = new Set();
  const por = (tipo, rotulo, href, origem) => {
    const k = tipo + '|' + String(href || rotulo).toLowerCase();
    if (vistos.has(k) || !rotulo) return;
    vistos.add(k);
    saida.push({ tipo, rotulo, href, origem });
  };
  if (x.whatsapp) por('zap', x.whatsapp, 'https://wa.me/' + String(x.whatsapp).replace(/\D/g, ''), 'mapa');
  if (x.fone) por('fone', x.fone, 'tel:' + (x.foneIntl ? '+' + x.foneIntl : x.fone), 'mapa');
  (c.zaps || []).forEach((z) => por('zap', z, 'https://wa.me/' + z, 'site'));
  (c.telefones || []).forEach((t) => por('fone', t, 'tel:' + t.replace(/[^\d+]/g, ''), 'site'));
  if (x.email) por('email', x.email, 'mailto:' + x.email, 'mapa');
  (c.emails || []).forEach((e) => por('email', e, 'mailto:' + e, 'site'));
  if (x.site) por('site', dominio(x.site), x.site, 'mapa');
  if (v.site && v.site !== x.site) por('site', dominio(v.site), v.site, 'web');
  if (c.paginaContato) por('form', 'página de contato', c.paginaContato, 'site');
  const redes = { ...(x.redes || {}), ...(c.redes || {}), ...(v.redes || {}) };
  for (const [nome, url] of Object.entries(redes)) if (url) por('rede', NOME_REDE[nome] || nome, url, (x.redes || {})[nome] ? 'mapa' : (c.redes || {})[nome] ? 'site' : 'web');
  if (!redes.instagram && !redes.facebook && x.insta) por('rede', dominio(x.insta), x.insta, 'mapa');
  if (x.maps) por('mapa', 'ficha no Google', x.maps, 'mapa');
  if (x.diretorio) por('diretorio', dominio(x.diretorio), x.diretorio, 'mapa');
  (v.diretorios || []).forEach((d) => por('diretorio', d, 'https://' + d, 'web'));
  (v.talvez || []).forEach((u) => por('talvez', 'pode ser: ' + dominio(u), u, 'web'));
  return saida;
}

const ICONE_CANAL = { zap: 'zap', fone: 'fone', email: 'email', site: 'site', rede: 'rede', diretorio: 'diretorio', talvez: 'busca', form: 'orcamento', mapa: 'mapa' };

/* No topo do cartão: só os ícones, pra bater o olho e saber se dá
   pra falar com a pessoa. */
function canais(i) {
  const tipos = [...new Set(contatosDe(i).map((c) => c.tipo))].filter((t) => t !== 'mapa');
  const rotulo = { zap: 'WhatsApp', fone: 'telefone', email: 'e-mail', site: 'site', rede: 'rede social', diretorio: 'ficha de diretório', form: 'formulário' };
  if (!tipos.length) return '<span class="canal canal--nada">sem contato ainda</span>';
  return tipos.map((t) => `<span class="canal" title="${esc(rotulo[t] || t)}">${ico(ICONE_CANAL[t] || 'lista')}${esc(rotulo[t] || t)}</span>`).join('');
}

function pintarCards() {
  const raiz = $('#cards');
  raiz.innerHTML = '';
  RESULTADOS.forEach((x, i) => {
    const [cls, tag] = TAG(x);
    const s = scoreDe(i);
    const art = document.createElement('article');
    art.className = 'card'; art.dataset.i = i;
    art.innerHTML = `
      <div class="card__topo" role="button" tabindex="0" aria-expanded="false">
        <div>
          <div class="tags">
            <span class="tag ${cls}">${tag}</span>
            ${x.avaliacoes >= 150 ? '<span class="tag tag--verde">muito movimento</span>' : ''}
            ${x.nota && x.nota < 4 ? '<span class="tag tag--ambar">nota baixa</span>' : ''}
            ${capenga(x) ? '<span class="tag">perfil capenga</span>' : ''}
            ${x.praca ? '<span class="tag">' + esc(x.praca) + '</span>' : ''}
          </div>
          <h3 class="card__nome">${esc(x.nome)}</h3>
          <p class="card__end">${ico('mapa')}${esc(x.end || 'sem endereço')}</p>
          <p class="card__meta">
            ${x.nota ? '<span>' + ico('estrela') + '<b>' + esc(x.nota) + '</b> · ' + num(x.avaliacoes) + ' avaliações</span>' : '<span>' + ico('estrela') + 'sem avaliações</span>'}
            ${x.tipo ? '<span>' + ico('lista') + esc(x.tipo) + '</span>' : ''}
            ${x.horario ? '<span>' + ico('relogio') + 'tem horário</span>' : ''}
          </p>
          <div class="canais" data-canais="${i}">${canais(i)}</div>
        </div>
        <div class="score" data-faixa="${faixaScore(s)}"><b>${s}</b><span>oportun.</span></div>
      </div>
      <div class="card__corpo" hidden></div>`;
    const topo = $('.card__topo', art);
    topo.onclick = () => abrirCard(i, art);
    topo.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCard(i, art); } };
    raiz.appendChild(art);
  });
  aplicarFiltro();
}

function abrirCard(i, art) {
  const corpo = $('.card__corpo', art);
  const aberto = art.classList.toggle('aberto');
  corpo.hidden = !aberto;
  $('.card__topo', art).setAttribute('aria-expanded', aberto ? 'true' : 'false');
  if (!aberto || corpo.dataset.pronto) return;
  corpo.dataset.pronto = '1';
  montarCorpo(i, art);
}

function montarCorpo(i, art) {
  const x = RESULTADOS[i];
  const corpo = $('.card__corpo', art);
  corpo.innerHTML = `
    <div class="analise">
      <section class="bloco-analise" data-porque></section>
      <section class="bloco-analise" data-perfil></section>
      <section class="bloco-analise diag" data-diag>
        <p class="eyebrow">${ico('site')} O site</p>
        <div data-diag-corpo><p class="diag__vazio">${x.site ? '<span class="girando"></span> lendo ' + esc(x.site) : x.diretorio ? 'O endereço do perfil é uma ficha em ' + esc(dominio(x.diretorio)) + ', não um site.' : x.soRede ? 'Não tem site, só ' + esc(dominio(x.insta || '')) + '.' : 'Não tem site nem rede no cadastro.'}</p></div>
      </section>
      <section class="bloco-analise" data-contatos></section>
      <div class="oque" data-oque></div>
    </div>
    <div class="msg">
      <div class="msg__topo"><p class="eyebrow">${ico('zap')} Mensagem</p><span class="msg__versao" data-versao></span></div>
      <textarea class="msg__texto" data-texto spellcheck="false"></textarea>
      <div class="msg__acoes">
        <button class="mini mini--ia" type="button" data-ia title="${CONFIG.ia ? 'Escreve uma mensagem nova com o Claude, usando as opiniões e o diagnóstico' : 'Defina ANTHROPIC_API_KEY na stack pra ligar'}" ${CONFIG.ia ? '' : 'disabled'}>Escrever com IA ✦</button>
        <button class="mini" type="button" data-trocar>Trocar versão ↻</button>
        <button class="mini" type="button" data-traduzir title="Traduz o texto que está aí do português para o inglês">Traduzir pro inglês</button>
        <button class="mini" type="button" data-copiar>Copiar</button>
        <button class="mini" type="button" data-salvar>Salvar na minha lista</button>
        ${x.fone || x.whatsapp ? `<a class="mini" data-zap target="_blank" rel="noopener" href="${esc(linkZap(x, CTX.pais))}">WhatsApp ↗</a>` : ''}
        ${x.fone ? `<a class="mini" href="tel:${esc((x.foneIntl ? '+' + x.foneIntl : x.fone))}">Ligar ↗</a>` : ''}
        <a class="mini" target="_blank" rel="noopener" href="${esc(x.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(x.nome + ' ' + (x.end || '')))}">Ver no Google ↗</a>
      </div>
    </div>`;

  const ta = $('[data-texto]', corpo);
  ta.oninput = () => { if (MSG[i]) MSG[i].texto = ta.value; const a = $('[data-zap]', corpo); if (a) a.href = linkZap(x, CTX.pais, ta.value); };
  $('[data-trocar]', corpo).onclick = () => { gerarMensagem(i, ((MSG[i]?.versao || 0) % 4) + 1); };
  $('[data-traduzir]', corpo).onclick = (e) => traduzirMensagem(i, e.currentTarget);
  $('[data-copiar]', corpo).onclick = () => copiar(ta.value, 'Mensagem copiada.');
  $('[data-salvar]', corpo).onclick = (e) => salvarLead(leadDe(x, i), e.currentTarget);
  $('[data-ia]', corpo).onclick = (e) => escreverComIa(i, e.currentTarget);

  gerarMensagem(i, 1);
  pintarPorque(i);
  pintarPerfil(i);
  pintarContatos(i);
  pintarPlano(i);
  if (x.site) diagnosticar(i);
}

/* ---------- de onde vem a nota ---------- */
function pintarPorque(i) {
  const x = RESULTADOS[i];
  const el = $(`#cards .card[data-i="${i}"] [data-porque]`);
  if (!el) return;
  const lista = x.porque || [];
  const s = scoreDe(i);
  el.innerHTML = `
    <p class="eyebrow">${ico('mais')} Por que ${s} de oportunidade</p>
    ${lista.length
      ? '<ul class="motivos">' + lista.map((p) => `<li class="motivo motivo--${p.pontos >= 0 ? 'soma' : 'tira'}">${ico(p.pontos >= 0 ? 'mais' : 'menos')}<span>${esc(p.texto)}</span><b>${p.pontos >= 0 ? '+' : ''}${p.pontos}</b></li>`).join('') + '</ul>'
      : '<p class="diag__vazio">Nota da varredura, sem detalhe. Abra o diagnóstico do site pra recalcular.</p>'}`;
}

/* ---------- perfil no Google ---------- */
const ICONE_ESTADO = { bom: 'ok', ruim: 'alerta', falta: 'falta', desconhecido: 'busca' };
function pintarPerfil(i) {
  const x = RESULTADOS[i];
  const el = $(`#cards .card[data-i="${i}"] [data-perfil]`);
  if (!el) return;
  const p = x.perfil;
  if (!p?.itens?.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <p class="eyebrow">${ico('google')} Perfil no Google · <b>${p.bons}</b> ok, <b>${p.ruins}</b> a melhorar, <b>${p.faltas}</b> faltando</p>
    <ul class="perfil">
      ${p.itens.map((it) => `<li class="perfil__item" data-estado="${esc(it.estado)}">${ico(ICONE_ESTADO[it.estado] || 'falta')}<span><b>${esc(it.item)}</b> ${esc(it.texto)}</span></li>`).join('')}
    </ul>
    ${CTX.fonte === 'osm' ? '<p class="nota-fonte">Fonte OpenStreetMap: foto e avaliação não aparecem aqui. Abra a ficha no Google pra conferir esses dois.</p>' : ''}`;
}

/* ---------- contatos e busca na web ---------- */
function pintarContatos(i) {
  const x = RESULTADOS[i];
  const el = $(`#cards .card[data-i="${i}"] [data-contatos]`);
  if (!el) return;
  const lista = contatosDe(i);
  const v = VERIF[i];
  el.innerHTML = `
    <p class="eyebrow">${ico('fone')} Como falar com eles</p>
    ${lista.length ? `<ul class="contatos">${lista.map((c) => `
      <li class="contato contato--${esc(c.tipo)}">
        ${ico(ICONE_CANAL[c.tipo] || 'lista')}
        ${c.href ? `<a href="${esc(c.href)}" target="_blank" rel="noopener">${esc(c.rotulo)}</a>` : `<span>${esc(c.rotulo)}</span>`}
        <em>${esc(ORIGEM[c.origem] || '')}</em>
        <button class="mini mini--nu" type="button" data-copia="${esc(c.rotulo)}" title="Copiar">copiar</button>
      </li>`).join('')}</ul>` : '<p class="diag__vazio">Nenhum contato no cadastro.</p>'}
    <div class="diag__acoes">
      <button class="mini" type="button" data-web>${v ? 'Procurar na web de novo' : 'Procurar site e contatos na web'}</button>
      ${v ? `<span class="tag ${v.estado === 'site' ? 'tag--verde' : v.estado === 'rede' ? 'tag--ambar' : 'tag--fogo'}">${esc(recadoVerif(v))}</span>` : ''}
    </div>`;
  $$('[data-copia]', el).forEach((b) => { b.onclick = () => copiar(b.dataset.copia, 'Copiado.'); });
  $('[data-web]', el).onclick = (e) => verificarNaWeb(i, e.currentTarget);
}

function recadoVerif(v) {
  if (v.estado === 'site') return `site achado (confiança ${v.confianca === 'alta' ? 'alta' : 'média'})`;
  if (v.estado === 'rede') return 'só redes sociais na web';
  if (v.estado === 'bloqueado') return 'a busca barrou agora';
  if (v.estado === 'erro') return 'a busca não respondeu';
  if (v.talvez?.length) return `nenhum site próprio; ${v.talvez.length} página(s) a conferir na mão`;
  return 'confirmado: nenhum site';
}

/* A lista inteira é redesenhada quando um negócio muda de situação;
   este aqui volta aberto, senão some debaixo do dedo de quem clicou. */
function reabrirCartao(i) {
  pintarCards();
  const art = $(`#cards .card[data-i="${i}"]`);
  if (!art) return;
  art.classList.add('aberto');
  const corpo = $('.card__corpo', art);
  corpo.hidden = false; corpo.dataset.pronto = '1';
  $('.card__topo', art).setAttribute('aria-expanded', 'true');
  montarCorpo(i, art);
  // Com site, quem recalcula é o diagnóstico que montarCorpo dispara.
  if (!RESULTADOS[i].site) recalcular(i);
}

/* Procura o negócio na web pra confirmar o "sem site" e pescar
   contato que o mapa não tinha. */
async function verificarNaWeb(i, btn) {
  const x = RESULTADOS[i];
  const antes = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="girando"></span> procurando…';
  try {
    const q = new URLSearchParams({ nome: x.nome, cidade: x.praca || CTX.cidade || '', pais: CTX.pais || '' });
    const v = await api('/api/prospeccao/verificar?' + q.toString());
    VERIF[i] = v;
    if (v.erro) throw new Error(v.erro);
    if (v.estado === 'site' && v.site && !x.site) {
      // Achou site: o negócio deixa de ser "sem site" e passa pelo
      // diagnóstico, igualzinho a quem já veio com site.
      x.site = v.site; x.semSite = false; x.soRede = false; x.semNada = false;
      avisar(`${x.nome}: achei ${dominio(v.site)}.`);
      return reabrirCartao(i);
    }
    const rede = v.redes?.instagram || v.redes?.facebook || '';
    if (rede && !x.insta) {
      // Não tem site, mas tem rede: sai do "sem nada" e a abordagem muda.
      x.insta = rede; x.semNada = false; x.soRede = true;
      avisar(`${x.nome}: sem site, mas achei ${dominio(rede)}.`);
      return reabrirCartao(i);
    }
    if (v.estado === 'bloqueado' || v.estado === 'erro') avisar(v.motivo || 'A busca não respondeu.', 'erro');
    pintarContatos(i);
    recalcular(i);
  } catch (e) {
    avisar('Não consegui procurar: ' + e.message, 'erro');
    btn.disabled = false; btn.textContent = antes;
  }
}

/* ---------- diagnóstico rápido + análise profunda ---------- */
function elDiag(i) { return $(`#cards .card[data-i="${i}"] [data-diag-corpo]`); }

async function diagnosticar(i) {
  const x = RESULTADOS[i];
  try {
    DIAG[i] = await api('/api/prospeccao/site?url=' + encodeURIComponent(x.site));
  } catch (e) {
    DIAG[i] = { nota: null, problemas: [{ chave: 'erro', peso: 0, texto: 'Não consegui ler: ' + e.message }], bons: [] };
  }
  pintarDiag(i);
  pintarContatos(i);
  await recalcular(i);
  if (MSG[i] && !MSG[i].ia) gerarMensagem(i, MSG[i].versao);
}

/* O que a página tem, pra não prometer o que já existe. */
const RECURSOS = [
  ['depoimentos', 'depoimentos'], ['galeria', 'galeria de trabalhos'], ['precos', 'preço na página'],
  ['formulario', 'formulário'], ['whatsapp', 'WhatsApp'], ['agendamento', 'agendamento'],
  ['mapa', 'mapa'], ['faq', 'perguntas frequentes'],
];

function pintarDiag(i) {
  const d = DIAG[i]; const el = elDiag(i); if (!el || !d) return;
  const faixa = d.nota == null ? '' : d.nota >= 75 ? 'bom' : d.nota >= 50 ? 'medio' : 'ruim';
  const porte = { pequeno: 'operação enxuta', medio: 'porte médio', grande: 'tem equipe' }[d.porte] || '';
  const sinais = (d.porte === 'grande' ? d.sinaisGrande : d.sinaisPequeno) || [];
  const r = d.recursos;
  el.innerHTML = `
    <div class="diag__topo">
      <span class="diag__nota" data-faixa="${faixa}">${d.nota == null ? '-' : d.nota}</span>
      <span class="diag__meta">${d.nota == null ? '' : 'de 100'}${d.ms ? ' · abriu em ' + (d.ms / 1000).toFixed(1) + ' s' : ''}${d.kb ? ' · ' + d.kb + ' KB' : ''}${d.titulo ? ' · “' + esc(d.titulo.slice(0, 50)) + '”' : ''}</span>
    </div>
    ${d.problemas?.length ? '<ul>' + d.problemas.map((p) => '<li class="com-ico">' + ico('alerta') + esc(p.texto) + '</li>').join('') + '</ul>' : '<p class="diag__vazio">Nenhum problema grosseiro no primeiro olhar.</p>'}
    ${d.bons?.length ? '<ul>' + d.bons.map((b) => '<li class="bom com-ico">' + ico('ok') + esc(b) + '</li>').join('') + '</ul>' : ''}
    ${r ? '<div class="recursos">' + RECURSOS.map(([k, rot]) => `<span class="recurso" data-tem="${r[k] ? '1' : '0'}">${ico(r[k] ? 'ok' : 'falta')}${esc(rot)}</span>`).join('') + '</div>' : ''}
    ${porte ? '<p class="diag__porte">' + ico('equipe') + 'Porte: <b>' + porte + '</b>' + (sinais.length ? ' <span class="diag__sinais">· ' + esc(sinais.join(' · ')) + '</span>' : '') + '</p>' : ''}
    <div class="diag__acoes">
      ${d.profunda ? '<span class="tag tag--verde">análise profunda feita</span>' : '<button class="mini" type="button" data-profunda>Análise profunda com o Google ↗</button>'}
    </div>
    <div class="progresso" data-prog hidden><i></i></div>
    <p class="progresso__texto" data-prog-texto hidden></p>`;
  const b = $('[data-profunda]', el);
  if (b) b.onclick = () => analiseProfunda(i);
}

function atualizarScore(i) {
  const s = scoreDe(i);
  const el = $(`#cards .card[data-i="${i}"] .score`);
  if (el) { el.dataset.faixa = faixaScore(s); $('b', el).textContent = s; }
  pintarKpis();
  aplicarFiltro();
}

/* PageSpeed sai direto do navegador: o Google leva de 20 a 40 s e não
   vale segurar o servidor esse tempo. Regras viram problemas com peso. */
async function analiseProfunda(i) {
  const x = RESULTADOS[i]; const el = elDiag(i); if (!el) return;
  const prog = $('[data-prog]', el), txt = $('[data-prog-texto]', el), btn = $('[data-profunda]', el);
  if (!btn) return;
  btn.disabled = true; prog.hidden = false; txt.hidden = false;
  const t0 = Date.now();
  const etapa = (t) => t < 5 ? 'Carregando a página como se fosse um celular' : t < 14 ? 'Medindo quanto demora pra aparecer' : t < 26 ? 'Conferindo o que o Google usa pra ranquear' : 'Quase lá, o Google é lento nessa parte';
  // Barra falsa mas honesta: anda pelo tempo real e trava em 95 %.
  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    $('i', prog).style.width = Math.min(95, 100 * (1 - Math.exp(-t / 34 * 2.2))).toFixed(1) + '%';
    txt.textContent = etapa(t) + '…';
  }, 400);
  try {
    const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    u.searchParams.set('url', x.site); u.searchParams.set('strategy', 'mobile');
    u.searchParams.append('category', 'performance'); u.searchParams.append('category', 'seo');
    if (CONFIG.pagespeedKey) u.searchParams.set('key', CONFIG.pagespeedKey);
    const r = await fetch(u);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || 'o Google não conseguiu analisar');
    const lr = d.lighthouseResult || {};
    const perf = Math.round((lr.categories?.performance?.score ?? 0) * 100);
    const seo = Math.round((lr.categories?.seo?.score ?? 0) * 100);
    const lcp = lr.audits?.['largest-contentful-paint']?.numericValue ?? 0;
    const cls = lr.audits?.['cumulative-layout-shift']?.numericValue ?? 0;
    const tbt = lr.audits?.['total-blocking-time']?.numericValue ?? 0;
    const novos = [];
    if (perf < 50) novos.push({ chave: 'perf', peso: 26, texto: `Nota ${perf} de 100 em velocidade no celular` });
    else if (perf < 80) novos.push({ chave: 'perf', peso: 14, texto: `Nota ${perf} de 100 em velocidade no celular` });
    if (lcp > 4000) novos.push({ chave: 'lcp', peso: 22, texto: `A tela principal só aparece em ${(lcp / 1000).toFixed(1)} s` });
    else if (lcp > 2500) novos.push({ chave: 'lcp', peso: 12, texto: `A tela principal demora ${(lcp / 1000).toFixed(1)} s pra aparecer` });
    if (cls > 0.25) novos.push({ chave: 'cls', peso: 16, texto: 'O conteúdo pula enquanto carrega. O dedo erra o botão' });
    if (tbt > 600) novos.push({ chave: 'tbt', peso: 14, texto: 'A página trava ao toque enquanto carrega' });
    if (seo < 80) novos.push({ chave: 'seo', peso: 16, texto: `Nota ${seo} de 100 no que o Google usa pra ranquear` });

    const antigo = DIAG[i] || { problemas: [], bons: [] };
    // Se o Google abriu o site, "fora"/"erro" era bloqueio de robô, não site fora do ar.
    const base = (antigo.problemas || []).filter((p) => p.chave !== 'fora' && p.chave !== 'erro');
    const porChave = new Map(base.map((p) => [p.chave, p]));
    for (const p of novos) porChave.set(p.chave, p);
    const problemas = [...porChave.values()];
    const bons = [...(antigo.bons || [])];
    if (perf >= 80) bons.push(`Velocidade ${perf} de 100 no celular`);
    if (seo >= 80) bons.push(`Nota ${seo} de 100 pro Google`);
    DIAG[i] = { ...antigo, problemas, bons, nota: Math.max(0, Math.min(100, 100 - problemas.reduce((s, p) => s + p.peso, 0))), profunda: true, perf, seo };
    pintarDiag(i);
    await recalcular(i);
    if (MSG[i] && !MSG[i].ia) gerarMensagem(i, MSG[i].versao);
    avisar('Análise profunda concluída.');
  } catch (e) {
    avisar('O Google não conseguiu analisar: ' + e.message, 'erro');
    btn.disabled = false; prog.hidden = true; txt.hidden = true;
  } finally { clearInterval(timer); }
}

/* ============================================================
   Mensagens: templates locais (sem custo)
   Estrutura: o que eu vi → o que isso custa → o que eu já fiz
   → fecho sem pedir permissão.
   ============================================================ */
const primeiroNome = () => (PERFIL.nome || 'Samuel').trim().split(/\s+/)[0];

function sc() {
  const h = new Date().getHours();
  return h < 12 ? 'Oi, bom dia!' : h < 18 ? 'Oi, boa tarde!' : 'Oi, boa noite!';
}
/* Nome como a vizinhança chama: sem LTDA, sem "Dr.", sem "clínica", no máximo duas palavras. */
function curto(nome) {
  const lixo = /\b(ltda|me|eireli|epp|s\/?a|mei|cnpj|dr\.?|dra\.?|clínica|clinica|odontologia|odontológica|odontologica|consultório|consultorio|estúdio|estudio|studio|salão|salao|barbearia|academia|restaurante|escritório|escritorio|advocacia|advogados|associados|sociedade|contabilidade|contábil|contabil|imobiliária|imobiliaria|pet ?shop|veterinária|veterinaria|centro|espaço|espaco|instituto|laboratório|laboratorio|oficina|mecânica|mecanica|auto ?center|hamburgueria|pizzaria|lanchonete|the|and|de|da|do|dos|das|e|&)\b/gi;
  const limpo = String(nome || '').replace(/[|–—:].*$/, '').replace(lixo, ' ').replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();
  const partes = (limpo || String(nome || '')).split(' ').filter(Boolean).slice(0, 2);
  return partes.join(' ') || 'vocês';
}
/* Bairro no padrão "Rua, nº - Bairro, Cidade - UF, CEP". */
function bairro(end, cidade) {
  const m = String(end || '').match(/ - ([^,\-]+?)(?:,|$)/);
  let b = m ? m[1].trim() : '';
  if (!b || /\d{5}-?\d{3}/.test(b) || /^[A-Z]{2}$/.test(b)) return '';
  const cid = String(cidade || '').split(',')[0].trim().toLowerCase();
  if (cid && b.toLowerCase() === cid) return '';
  return b;
}
const noBairro = (x) => { const b = bairro(x.end, CTX.cidade); return b ? ` ${/^(vila|praia|cidade|chácara|chacara|fazenda|barra|ilha|lagoa|várzea|varzea|granja|zona)\b/i.test(b) ? 'na' : 'no'} ${b}` : ''; };
function rep(x) {
  const av = Number(x.avaliacoes) || 0, n = Number(x.nota) || 0;
  if (n >= 4.5 && av >= 100) return `${num(av)} avaliações com média ${String(n).replace('.', ',')}`;
  if (av >= 40) return `${num(av)} avaliações`;
  return '';
}
const humano = (p) => p.texto.charAt(0).toLowerCase() + p.texto.slice(1).replace(/\s*(?:[—–]|\.\s).*$/, '').replace(/\s*\([^)]*\)/g, '');
function defeitos(i, n) {
  const d = DIAG[i];
  // Os de maior peso primeiro: "sem botão de contato" fala com o dono; "meta description" não.
  const lista = (d?.problemas || []).filter((p) => p.chave !== 'fora' && p.chave !== 'erro').sort((a, b) => b.peso - a.peso).slice(0, n).map(humano);
  return lista.join(', e ');
}
const solto = () => ['Sem compromisso nenhum.', 'Se não fizer sentido, é só ignorar.', 'Você vê e me diz o que achou.'][Math.floor(Math.random() * 3)];
const assina = () => `\n\n${primeiroNome()}`;
const euCid = () => PERFIL.cidade ? ` aqui de ${PERFIL.cidade}` : '';

/* Personalização: o que sai do plano e do perfil entra na mensagem,
   senão o negócio recebe o mesmo texto que o vizinho. */
const citado = (i) => (RESULTADOS[i]?.plano?.destaques?.termos || []).slice(0, 2).join(' e ');
const elogioDe = (i) => {
  const e = RESULTADOS[i]?.plano?.destaques?.elogio || '';
  return e && e.length <= 120 ? e : '';
};
function faltaNoPerfil(i) {
  const itens = RESULTADOS[i]?.perfil?.itens || [];
  const f = itens.filter((x) => x.estado === 'falta').map((x) => x.item.toLowerCase());
  return f.slice(0, 2).join(' e ');
}
function entrega(i) {
  const itens = RESULTADOS[i]?.plano?.itens || [];
  const bom = itens.find((x) => !['tela', 'busca', 'google', 'conserto', 'alerta'].includes(x.icone));
  return bom ? bom.titulo.toLowerCase() : '';
}

/* Os modelos são todos em português, inclusive para lead de fora.
   A gente escreve e ajusta na nossa língua e, na hora de mandar,
   o botão traduz pro inglês. */
const T = {
  SEM_NADA: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Procurei ${curto(x.nome)} no Google${noBairro(x)} e só achei a ficha do Maps${rep(x) ? ' (' + rep(x) + ')' : ''}, nenhum site, nenhuma rede. Quem chega por indicação tenta confirmar antes de ligar e não tem pra onde ir; boa parte fecha a aba e liga pro que tem página. Montei uma página de uma dobra com o essencial de vocês pra você ver como ficaria. Te mando o link ainda hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}${euCid()}. Vi que ${curto(x.nome)}${noBairro(x)} vive de indicação${rep(x) ? ', e as ' + rep(x) + ' mostram que funciona' : ''}.${citado(i) ? ` Nas opiniões, o que mais aparece é ${citado(i)}.` : ''} Só que indicação tem teto: ela chega até onde a memória dos clientes alcança. Quem procura no Google não encontra vocês, encontra o concorrente. Já deixei pronta uma página simples, com as avaliações em destaque e botão de WhatsApp. Te mando pra você olhar. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}. Pesquisei ${curto(x.nome)}${noBairro(x)} e reparei que não há site nem rede, só o endereço${faltaNoPerfil(i) ? `, e a ficha do Google está sem ${faltaNoPerfil(i)}` : ''}. Quando o cliente não vê nada, ele não tem como comparar qualidade; sobra o preço, e aí quem cobra menos leva. Fiz uma primeira tela mostrando o que diferencia vocês${rep(x) ? ' (as ' + rep(x) + ' já contam metade da história)' : ''}. Te envio hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, ${PERFIL.faz}${euCid()}.${elogioDe(i) ? ` Li as opiniões de ${curto(x.nome)} no Google e uma delas diz: "${elogioDe(i)}".` : ` Achei ${curto(x.nome)} no Maps${noBairro(x)}, sem site.`} Isso está preso dentro do Google, e quem pesquisa no celular decide em menos de um minuto: abre dois ou três, escolhe o que passa mais confiança e chama. Preparei uma página de uma dobra${entrega(i) ? ' com ' + entrega(i) : ''} pra vocês entrarem nessa comparação. Te mando o link ainda hoje. ${solto()}${assina()}`,
  ],
  SO_REDE: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Vi que ${curto(x.nome)}${noBairro(x)} atende pela rede social, e o perfil está bem cuidado${rep(x) ? ', ' + rep(x) + ' no Google' : ''}. O problema é que o direct fecha quando o expediente fecha: quem chama à noite espera até o dia seguinte e, nesse meio-tempo, fala com outro. Montei uma página de uma dobra que responde as três perguntas de sempre e manda pro WhatsApp. Te envio hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}. Achei ${curto(x.nome)} no Google${noBairro(x)} e o único endereço é a rede social. Post some do feed em dois dias; página fica. Quem chega pelo Google hoje cai num perfil e precisa adivinhar o que vocês fazem, quanto custa e como chamar. Deixei pronta uma página que resolve isso numa tela${entrega(i) ? ', com ' + entrega(i) : ''}. Te mando o link. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, ${PERFIL.faz}${euCid()}. Vi ${curto(x.nome)}${noBairro(x)} pelo perfil${rep(x) ? ', ' + rep(x) + ' no Google, então o movimento é real' : ''}.${citado(i) ? ` As opiniões citam ${citado(i)}, que é justamente o que não dá pra ver num feed.` : ''} Aposto que o direct repete a mesma conversa dez vezes por dia: horário, endereço, valor, "como funciona". Uma página responde isso antes de o cliente chamar, e o direct fica só pra quem já quer marcar. Já fiz uma primeira versão. Te mando hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, faço ${PERFIL.faz}. Passei pelo perfil de ${curto(x.nome)}${noBairro(x)}: pra entender o que vocês fazem e pra quem, precisei rolar uns quinze posts. Cliente novo não rola quinze posts: fecha e vai pro próximo. Montei uma página de captura pra bio: o que faz, pra quem, prova e botão. Te envio o link ainda hoje. ${solto()}${assina()}`,
  ],
  DIRETORIO: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Cliquei no site de ${curto(x.nome)}${noBairro(x)} pelo Google e ele não leva a uma página de vocês: leva a uma ficha de diretório, com anúncio de concorrente do lado. Quem chegou procurando vocês sai comparando com outros três. Montei uma página própria, com as avaliações em destaque e contato direto. Te mando o link hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}. O endereço que aparece como site de ${curto(x.nome)} é um perfil de listagem, não uma página de vocês${rep(x) ? `, e vocês têm ${rep(x)} pra mostrar` : ''}. Ali você não escolhe a foto, não escreve a chamada e divide a tela com quem paga mais. Fiz uma primeira tela só de vocês pra você comparar. Te envio ainda hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, ${PERFIL.faz}${euCid()}. Procurei ${curto(x.nome)}${noBairro(x)} e caí num diretório.${citado(i) ? ` As opiniões falam de ${citado(i)}, e nada disso aparece por lá.` : ''} Uma página própria custa menos que um mês de anúncio nesses sites e não some se eles mudarem a regra. Já preparei a primeira versão${entrega(i) ? ', com ' + entrega(i) : ''}. Te mando pra você olhar. ${solto()}${assina()}`,
  ],
  COM_SITE: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Abri o site de ${curto(x.nome)}${noBairro(x)} pelo celular e ele trabalha contra vocês: ${defeitos(i, 2) || 'demora pra abrir e não tem um botão de contato claro'}. Cada cliente que chega por indicação passa por ele antes de chamar, e alguns desistem ali. Refiz a primeira tela resolvendo isso. Te mando o link hoje pra você comparar lado a lado. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}. ${rep(x) ? 'Vocês têm ' + rep(x) + ' no Google' : 'Vocês têm avaliações no Google'}, e o site de ${curto(x.nome)} não mostra nenhuma.${elogioDe(i) ? ` Uma delas diz: "${elogioDe(i)}".` : ''} É a prova mais forte que vocês têm, escondida do lugar onde o cliente decide. Montei uma primeira tela com as avaliações em destaque e o WhatsApp a um toque. Te envio ainda hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Passei pelo site de ${curto(x.nome)}${noBairro(x)} e tem um detalhe que provavelmente ninguém comentou: ${defeitos(i, 1) || 'ele não se adapta ao celular'}. Quem vê não avisa, só não chama. Já preparei uma versão corrigida da primeira tela${entrega(i) ? ', com ' + entrega(i) : ''} pra você ver a diferença. Te mando o link hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, ${PERFIL.faz}${euCid()}. O site de ${curto(x.nome)}${noBairro(x)} parou no tempo${defeitos(i, 1) ? ' (' + defeitos(i, 1) + ')' : ''}, e o negócio não parou${rep(x) ? ' (' + rep(x) + ' dizem isso)' : ''}. Quando o site é de uma época e o serviço é de outra, o cliente desconfia do serviço, não do site. Refiz a primeira tela no padrão de hoje. Te mando pra comparar. ${solto()}${assina()}`,
  ],
};

function banco(x) {
  if (x.semNada) return T.SEM_NADA;
  if (x.diretorio) return T.DIRETORIO;
  if (x.soRede) return T.SO_REDE;
  return T.COM_SITE;
}

function gerarMensagem(i, versao) {
  const x = RESULTADOS[i];
  const b = banco(x);
  const v = ((versao - 1) % b.length) + 1;
  const rotulo = `modelo · versão ${v} de ${b.length}`;
  MSG[i] = { texto: b[v - 1](x, i), versao: v, ia: false, rotulo, emIngles: false };
  const corpo = $(`#cards .card[data-i="${i}"] .card__corpo`);
  if (!corpo) return;
  $('[data-texto]', corpo).value = MSG[i].texto;
  $('[data-versao]', corpo).textContent = rotulo;
  const bt = $('[data-traduzir]', corpo); if (bt) bt.textContent = 'Traduzir pro inglês';
  const a = $('[data-zap]', corpo); if (a) a.href = linkZap(x, CTX.pais, MSG[i].texto);
  pintarPlano(i);
}

/* ---------- o que recriar ---------- */
function pintarPlano(i) {
  const el = $(`#cards .card[data-i="${i}"] [data-oque]`);
  if (!el) return;
  const p = RESULTADOS[i]?.plano;
  if (!p?.itens?.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="oque__topo">
      <b>${ico('tela')} O que recriar</b>
      <span class="oque__tag">${esc(p.titulo)} · ${esc(p.prazo)}</span>
    </div>
    <p class="oque__resumo">${esc(p.resumo)}</p>
    <ul class="oque__itens">${p.itens.map((it) => `<li>${ico(it.icone)}<span><b>${esc(it.titulo)}.</b> ${esc(it.texto)}</span></li>`).join('')}</ul>
    <div class="diag__acoes"><button class="mini" type="button" data-copiar-plano>Copiar o plano</button></div>`;
  $('[data-copiar-plano]', el).onclick = () => copiar(textoPlano(i), 'Plano copiado.');
}

function textoPlano(i) {
  const x = RESULTADOS[i]; const p = x?.plano;
  if (!p) return '';
  return [`${x.nome} · ${p.titulo} (${p.prazo})`, p.resumo, '', ...p.itens.map((it) => `- ${it.titulo}: ${it.texto}`)].join('\n');
}

/* ---------- tradução, só na hora de mandar ---------- */
async function traduzirMensagem(i, btn) {
  const corpo = btn.closest('.card__corpo');
  const ta = $('[data-texto]', corpo);
  const m = MSG[i] || (MSG[i] = { texto: ta.value, versao: 1, ia: false, rotulo: 'modelo' });
  if (m.emIngles && m.pt != null) {
    ta.value = m.pt; m.texto = m.pt; m.emIngles = false;
    $('[data-versao]', corpo).textContent = m.rotulo || '';
    btn.textContent = 'Traduzir pro inglês';
    const a1 = $('[data-zap]', corpo); if (a1) a1.href = linkZap(RESULTADOS[i], CTX.pais, m.texto);
    return;
  }
  const original = ta.value.trim();
  if (!original) return avisar('Não há texto pra traduzir.', 'erro');
  btn.disabled = true; btn.innerHTML = '<span class="girando"></span> traduzindo…';
  try {
    const d = await enviar('/api/prospeccao/traduzir', 'POST', { texto: original, de: 'pt', para: 'en' });
    if (d.erro) throw new Error(d.erro);
    m.pt = original; m.texto = d.texto; m.emIngles = true;
    ta.value = d.texto;
    $('[data-versao]', corpo).textContent = 'em inglês · tradução automática, leia antes de mandar';
    const a = $('[data-zap]', corpo); if (a) a.href = linkZap(RESULTADOS[i], CTX.pais, d.texto);
    btn.textContent = 'Voltar pro português';
  } catch (e) {
    avisar('Não traduzi: ' + e.message, 'erro');
    btn.textContent = 'Traduzir pro inglês';
  } finally { btn.disabled = false; }
}

/* ---------- mensagem com Claude ---------- */
async function escreverComIa(i, btn) {
  const x = RESULTADOS[i];
  const corpo = btn.closest('.card__corpo');
  const ta = $('[data-texto]', corpo);
  const variacao = (MSG[i]?.variacaoIa || 0) + 1;
  btn.disabled = true; btn.innerHTML = '<span class="girando"></span> escrevendo…';
  try {
    const d = await enviar('/api/prospeccao/mensagem', 'POST', {
      nome: x.nome, tipo: x.tipo, nicho: CTX.termo, bairro: bairro(x.end, CTX.cidade), cidade: CTX.cidade,
      nota: x.nota, avaliacoes: x.avaliacoes, site: x.site, rede: Boolean(x.insta),
      problemas: (DIAG[i]?.problemas || []).map((p) => p.texto), opinioes: x.opinioes || [],
      euNome: PERFIL.nome, euFaz: PERFIL.faz, euCidade: PERFIL.cidade,
      variacao, idioma: 'pt',
    });
    if (d.semChave) { avisar('Sem chave da Anthropic na stack. Usando os modelos locais.', 'erro'); return; }
    MSG[i] = { texto: d.texto, versao: MSG[i]?.versao || 1, ia: true, variacaoIa: variacao };
    ta.value = d.texto;
    $('[data-versao]', corpo).textContent = `escrita pela IA · variação ${variacao}`;
    const a = $('[data-zap]', corpo); if (a) a.href = linkZap(x, CTX.pais, d.texto);
  } catch (e) { avisar('A IA não escreveu: ' + e.message, 'erro'); }
  finally { btn.disabled = false; btn.textContent = 'Escrever com IA ✦'; }
}

/* ---------- WhatsApp ---------- */
const DDI = { br: '55', us: '1', ca: '1', gb: '44', ie: '353', au: '61', nz: '64', pt: '351', es: '34', mx: '52', ar: '54', cl: '56', co: '57', de: '49', fr: '33', it: '39', nl: '31', ae: '971' };
function digitosZap(x, pais) {
  if (x.foneIntl && x.foneIntl.length >= 10) return x.foneIntl;
  const d = String(x.fone || '').replace(/\D/g, '');
  if (!d) return '';
  const ddi = DDI[pais || 'br'] || '55';
  return d.startsWith(ddi) && d.length > 10 ? d : ddi + d;
}
function linkZap(x, pais, texto) {
  const d = digitosZap(x, pais);
  return d ? `https://wa.me/${d}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : '#';
}

/* ---------- lista inteira: copiar e CSV ---------- */
const visiveis = () => RESULTADOS.map((x, i) => [x, i]).filter(([, i]) => passaFiltro(i));
const doTipo = (i, tipo) => contatosDe(i).filter((c) => c.tipo === tipo).map((c) => c.rotulo).join(' / ');

/* Confere na web quem está marcado como sem site. É de dez em dez
   porque a busca pública corta o acesso de quem pede rápido demais. */
$('#conferir-web').onclick = async (e) => {
  const btn = e.currentTarget;
  const fila = visiveis().filter(([x, i]) => x.semSite && !VERIF[i]).slice(0, 10);
  if (!fila.length) return avisar('Nada novo pra conferir nesta lista.');
  btn.disabled = true;
  let achados = 0, feitos = 0;
  for (const [x, i] of fila) {
    feitos++;
    btn.innerHTML = `<span class="girando"></span> ${feitos} de ${fila.length}`;
    let v = null;
    try {
      const q = new URLSearchParams({ nome: x.nome, cidade: x.praca || CTX.cidade || '', pais: CTX.pais || '' });
      v = await api('/api/prospeccao/verificar?' + q.toString());
      VERIF[i] = v;
      if (v.estado === 'site' && v.site) { x.site = v.site; x.semSite = false; x.soRede = false; x.semNada = false; achados++; }
      else {
        const rede = v.redes?.instagram || v.redes?.facebook || '';
        if (rede && !x.insta) { x.insta = rede; x.semNada = false; x.soRede = true; }
      }
      await recalcular(i);
    } catch (err) { /* um que falhou não para a fila */ }
    if (v?.estado === 'bloqueado') { avisar('A busca pública barrou agora. Espere uns minutos e tente o resto.', 'erro'); break; }
    if (feitos < fila.length && !v?.doCache) await new Promise((ok) => setTimeout(ok, 1200));
  }
  pintarCards();
  pintarKpis();
  avisar(achados ? `${achados} tinham site escondido; entraram como "site pra refazer".` : 'Confirmado: nenhum deles tem site.');
  btn.disabled = false; btn.textContent = 'Conferir na web';
};

$('#copiar-lista').onclick = () => {
  const linhas = visiveis().map(([x, i]) => [x.nome, x.end, doTipo(i, 'fone') || doTipo(i, 'zap') || '', doTipo(i, 'email') || '', x.site || x.insta || x.diretorio || '', ROTULO(x), scoreDe(i), x.nota || '', x.avaliacoes || ''].join(' · '));
  copiar(linhas.join('\n'), `${linhas.length} linhas copiadas.`);
};
$('#baixar-csv').onclick = () => {
  const cel = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const linhas = [['nome', 'endereco', 'telefone', 'whatsapp', 'email', 'site', 'redes', 'o_que_fazer', 'entrega', 'oportunidade', 'nota', 'avaliacoes', 'perfil_google'].join(';')];
  for (const [x, i] of visiveis()) {
    linhas.push([
      x.nome, x.end, doTipo(i, 'fone'), doTipo(i, 'zap'), doTipo(i, 'email'),
      x.site || x.diretorio || '', contatosDe(i).filter((c) => c.tipo === 'rede').map((c) => c.href).join(' '),
      ROTULO(x), x.plano?.titulo || '', scoreDe(i), x.nota, x.avaliacoes,
      x.perfil ? `${x.perfil.bons} ok, ${x.perfil.ruins} ruins, ${x.perfil.faltas} faltando` : '',
    ].map(cel).join(';'));
  }
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prospeccao-${(CTX.cidade || 'lista').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/* ============================================================
   Leads: "Minha lista"
   ============================================================ */
function leadDe(x, i) {
  return {
    chave: (x.nome + '|' + (x.end || '')).toLowerCase().slice(0, 180),
    nome: x.nome, endereco: x.end, fone: x.fone || doTipo(i, 'fone'), foneIntl: x.foneIntl, site: x.site, insta: x.insta, maps: x.maps,
    email: x.email || doTipo(i, 'email'), whatsapp: x.whatsapp || doTipo(i, 'zap'),
    nota: x.nota, avaliacoes: x.avaliacoes, score: scoreDe(i), cidade: CTX.cidade, pais: CTX.pais || 'br', origem: 'mapa',
    entrega: x.plano?.titulo || '',
    situacao: x.semNada ? 'sem site e sem rede' : x.diretorio ? 'só ficha de diretório' : x.soRede ? 'só rede social' : 'site pra refazer',
  };
}
async function salvarLead(lead, btn) {
  try {
    const d = await enviar('/api/prospeccao/leads', 'POST', lead);
    if (d.jaExistia) avisar('Esse já está na sua lista.');
    else { LEADS.unshift(d.lead); avisar('Salvo na sua lista.'); }
    if (btn) { btn.textContent = 'Na lista ✓'; btn.classList.add('ok'); btn.disabled = true; }
    contarLeads();
  } catch (e) { avisar('Não salvei: ' + e.message, 'erro'); }
}
function contarLeads() {
  const n = LEADS.filter((l) => l.estado !== 'descartado').length;
  const el = $('#n-leads');
  el.textContent = n; el.hidden = !n;
}

const ETAPAS = ['mira', 'abordado', 'respondeu', 'proposta', 'fechado'];
const NOME_ETAPA = { mira: 'mirado', abordado: 'abordado', respondeu: 'respondeu', proposta: 'proposta', fechado: 'fechado', descartado: 'descartado' };

function pintarBoard() {
  // Funil cumulativo: quem fechou conta como abordado e como respondeu,
  // senão a taxa de resposta mente pra baixo.
  const ativos = LEADS.filter((l) => l.estado !== 'descartado');
  const conta = (etapa) => ativos.filter((l) => ETAPAS.indexOf(l.estado) >= ETAPAS.indexOf(etapa)).length;
  const mira = LEADS.length, abordado = conta('abordado'), respondeu = conta('respondeu'), fechado = conta('fechado');
  $('#fk-mira').textContent = mira;
  $('#fk-abordado').textContent = abordado;
  $('#fk-resposta').textContent = abordado ? Math.round(respondeu / abordado * 100) + '%' : '-';
  $('#fk-fechado').textContent = fechado;
  $('#fk-fechamento').textContent = abordado ? Math.round(fechado / abordado * 100) + '%' : '-';

  const maximo = Math.max(1, mira);
  $('#funil').innerHTML = ETAPAS.map((e) => {
    const n = e === 'mira' ? mira : conta(e);
    return `<div class="funil__linha" data-etapa="${e}"><span>${NOME_ETAPA[e]}</span><div class="funil__barra"><i style="width:${(n / maximo * 100).toFixed(1)}%"></i></div><b>${n}</b></div>`;
  }).join('');

  // abordagens por semana, 8 semanas, pela data do último toque
  const agora = Date.now();
  const semanas = Array.from({ length: 8 }, () => 0);
  for (const l of LEADS) {
    if (!l.ultimo_toque) continue;
    const k = Math.floor((agora - new Date(l.ultimo_toque).getTime()) / (7 * 86400000));
    if (k >= 0 && k < 8) semanas[7 - k]++;
  }
  const topo = Math.max(1, ...semanas);
  $('#semanas').innerHTML = semanas.map((n, i) => `<div class="semana"><b>${n || ''}</b><i style="height:${Math.max(2, n / topo * 80)}%"></i><span>${i === 7 ? 'hoje' : 's-' + (7 - i)}</span></div>`).join('');

  pintarLeads();
}

$$('#lista-filtros [data-estado]').forEach((b) => {
  b.onclick = () => {
    FILTRO_LEADS = b.dataset.estado;
    $$('#lista-filtros [data-estado]').forEach((x) => x.setAttribute('aria-checked', x.dataset.estado === FILTRO_LEADS ? 'true' : 'false'));
    pintarLeads();
  };
});

function pintarLeads() {
  const raiz = $('#leads');
  const lista = LEADS.filter((l) => FILTRO_LEADS === 'todos' ? true : FILTRO_LEADS === 'ativos' ? !['fechado', 'descartado'].includes(l.estado) : l.estado === FILTRO_LEADS);
  raiz.innerHTML = '';
  $('#leads-vazio').hidden = lista.length > 0;
  for (const l of lista) {
    const div = document.createElement('div');
    div.className = 'lead-card'; div.dataset.estado = l.estado;
    const x = { fone: l.fone, foneIntl: l.foneIntl };
    div.innerHTML = `
      <div>
        <div class="lead-card__nome">${esc(l.nome)}</div>
        <div class="lead-card__end">${esc(l.endereco || l.insta || '')}</div>
        <div class="lead-card__meta">
          ${l.score ? '<span>oportunidade <b>' + esc(l.score) + '</b></span>' : ''}
          ${l.nota ? '<span>★ ' + esc(l.nota) + ' · ' + num(l.avaliacoes) + (l.origem === 'instagram' ? ' seguidores' : ' avaliações') + '</span>' : (l.avaliacoes && l.origem === 'instagram' ? '<span>' + num(l.avaliacoes) + ' seguidores</span>' : '')}
          ${l.situacao ? '<span>' + esc(l.situacao) + '</span>' : ''}
          ${l.entrega ? '<span>' + ico('tela') + esc(l.entrega) + '</span>' : ''}
          ${l.email ? '<span>' + ico('email') + esc(l.email) + '</span>' : ''}
          ${l.cidade ? '<span>' + esc(l.cidade) + '</span>' : ''}
          ${l.ultimo_toque ? '<span>toque ' + new Date(l.ultimo_toque).toLocaleDateString('pt-BR') + '</span>' : ''}
        </div>
      </div>
      <select data-estado>${['mira', 'abordado', 'respondeu', 'proposta', 'fechado', 'descartado'].map((e) => `<option value="${e}" ${e === l.estado ? 'selected' : ''}>${NOME_ETAPA[e]}</option>`).join('')}</select>
      <textarea data-anot placeholder="Anotação (salva sozinha)">${esc(l.anotacao || '')}</textarea>
      <div class="lead-card__acoes">
        ${l.fone ? `<a class="mini" target="_blank" rel="noopener" href="${esc(linkZap(x, l.pais))}">WhatsApp ↗</a>` : ''}
        ${l.email ? `<a class="mini" href="mailto:${esc(l.email)}">E-mail ↗</a>` : ''}
        ${l.site ? `<a class="mini" target="_blank" rel="noopener" href="${esc(l.site)}">Site ↗</a>` : ''}
        ${l.insta ? `<a class="mini" target="_blank" rel="noopener" href="${esc(l.insta)}">Perfil ↗</a>` : ''}
        ${l.maps ? `<a class="mini" target="_blank" rel="noopener" href="${esc(l.maps)}">Google ↗</a>` : ''}
        <button class="mini mini--perigo" type="button" data-remover>Remover</button>
      </div>`;
    $('[data-estado]', div).onchange = async (e) => {
      try {
        const d = await enviar('/api/prospeccao/leads/' + l.id, 'PUT', { estado: e.target.value });
        Object.assign(l, d.lead); div.dataset.estado = l.estado;
        pintarBoard(); contarLeads();
      } catch (x) { avisar('Não mudei: ' + x.message, 'erro'); }
    };
    $('[data-anot]', div).oninput = debounce(async (e) => {
      try { const d = await enviar('/api/prospeccao/leads/' + l.id, 'PUT', { anotacao: e.target.value }); Object.assign(l, d.lead); }
      catch (x) { avisar('Não salvei a anotação: ' + x.message, 'erro'); }
    }, 900);
    $('[data-remover]', div).onclick = async () => {
      if (!confirm('Tirar ' + l.nome + ' da lista?')) return;
      try { await api('/api/prospeccao/leads/' + l.id, { method: 'DELETE' }); LEADS = LEADS.filter((z) => z.id !== l.id); pintarBoard(); contarLeads(); }
      catch (x) { avisar('Não removi: ' + x.message, 'erro'); }
    };
    raiz.appendChild(div);
  }
}

/* ============================================================
   Quem vende na internet
   ============================================================ */
/* (a) anunciantes: só o link da Biblioteca, a Meta não abre API fora da Europa */
const inAnNicho = $('#anuncio-nicho'), aAbrir = $('#anuncio-abrir');
function linkBiblioteca() {
  const q = inAnNicho.value.trim();
  aAbrir.href = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(q || 'site')}`;
}
inAnNicho.oninput = linkBiblioteca; linkBiblioteca();

const textoAnuncio = (nome, d) => {
  const defs = (d.problemas || []).filter((p) => p.chave !== 'fora' && p.chave !== 'erro').sort((a, b) => b.peso - a.peso).slice(0, 2).map(humano).join(', e ');
  return `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Vi o anúncio de ${curto(nome)} rodando e abri a página de destino pelo celular: ${defs || 'ela demora e não tem um botão de contato claro'}. Cada clique pago que cai nela e vai embora é verba queimada: o anúncio funciona, a página não segura. Refiz a primeira tela pra converter o clique que vocês já compram. Te mando o link hoje. ${solto()}${assina()}`;
};

$('#anuncio-diag').onclick = async () => {
  const url = $('#anuncio-url').value.trim();
  if (!url) return avisar('Cole o endereço da página de destino.', 'erro');
  const raiz = $('#anuncio-resultado');
  raiz.innerHTML = '<p class="diag__vazio"><span class="girando"></span> lendo a página…</p>';
  try {
    const d = await api('/api/prospeccao/site?url=' + encodeURIComponent(url));
    const nome = d.titulo || new URL(d.url).hostname.replace(/^www\./, '');
    const faixa = d.nota >= 75 ? 'bom' : d.nota >= 50 ? 'medio' : 'ruim';
    const porte = { pequeno: 'operação enxuta', medio: 'porte médio', grande: 'tem equipe' }[d.porte] || '';
    const sinais = (d.porte === 'grande' ? d.sinaisGrande : d.sinaisPequeno) || [];
    const msg = textoAnuncio(nome, d);
    raiz.innerHTML = `
      <div class="card aberto"><div class="card__corpo" style="border-top:0">
        <div class="diag">
          <div class="diag__topo"><span class="diag__nota" data-faixa="${faixa}">${d.nota}</span><span class="diag__meta">de 100 · ${(d.ms / 1000).toFixed(1)} s · ${d.kb} KB${d.titulo ? ' · “' + esc(d.titulo.slice(0, 50)) + '”' : ''}</span></div>
          ${d.problemas?.length ? '<ul>' + d.problemas.map((p) => '<li>' + esc(p.texto) + '</li>').join('') + '</ul>' : '<p class="diag__vazio">Nenhum problema grosseiro.</p>'}
          ${d.bons?.length ? '<ul>' + d.bons.map((b) => '<li class="bom">' + esc(b) + '</li>').join('') + '</ul>' : ''}
          ${porte ? '<p class="diag__porte">Porte: <b>' + porte + '</b>' + (sinais.length ? ' <span class="diag__sinais">· ' + esc(sinais.join(' · ')) + '</span>' : '') + '</p>' : ''}
        </div>
        <div class="msg">
          <div class="msg__topo"><p class="eyebrow">Mensagem</p><span class="msg__versao">gancho: verba de clique queimada</span></div>
          <textarea class="msg__texto" data-texto spellcheck="false">${esc(msg)}</textarea>
          <div class="msg__acoes">
            <button class="mini" type="button" data-copiar>Copiar</button>
            <button class="mini" type="button" data-salvar>Salvar na minha lista</button>
            <a class="mini" target="_blank" rel="noopener" href="${esc(d.url)}">Abrir a página ↗</a>
          </div>
        </div>
      </div></div>`;
    $('[data-copiar]', raiz).onclick = () => copiar($('[data-texto]', raiz).value, 'Mensagem copiada.');
    $('[data-salvar]', raiz).onclick = (e) => salvarLead({ chave: 'anuncio|' + d.url.toLowerCase().slice(0, 170), nome, site: d.url, score: Math.max(40, 100 - d.nota), origem: 'anuncio', situacao: 'anuncia e a página é fraca' }, e.currentTarget);
  } catch (e) {
    raiz.innerHTML = `<p class="diag__vazio">Não consegui ler: ${esc(e.message)}</p>`;
  }
};

/* (b) perfis do Instagram via Serper */
$$('#insta-filtros [data-faixa]').forEach((b) => {
  b.onclick = () => {
    FILTRO_INSTA = b.dataset.faixa;
    $$('#insta-filtros [data-faixa]').forEach((x) => x.setAttribute('aria-checked', x.dataset.faixa === FILTRO_INSTA ? 'true' : 'false'));
    pintarInsta();
  };
});
$('#insta-buscar').onclick = async () => {
  const termo = $('#insta-termo').value.trim(), cidade = $('#insta-cidade').value.trim();
  if (!termo) return avisar('Diga o que procura.', 'erro');
  const btn = $('#insta-buscar');
  btn.disabled = true;
  try {
    const d = await api(`/api/prospeccao/instagram?termo=${encodeURIComponent(termo)}&cidade=${encodeURIComponent(cidade)}`);
    if (d.semChave) { $('#insta-semchave').hidden = false; return; }
    INSTA = d.lista || [];
    $('#insta-kpis').hidden = false; $('#insta-filtros').hidden = false;
    $('#ik-total').textContent = d.total; $('#ik-vale').textContent = INSTA.filter((p) => p.faixa === 'no ponto').length; $('#ik-seg').textContent = d.comSeguidores;
    pintarInsta();
  } catch (e) { avisar('A busca falhou: ' + e.message, 'erro'); }
  finally { btn.disabled = false; }
};
function pintarInsta() {
  const raiz = $('#insta-cards');
  const lista = INSTA.filter((p) => FILTRO_INSTA === 'todos' || p.faixa !== 'não vale');
  raiz.innerHTML = lista.length ? '' : '<p class="vazio">Nenhum perfil nesse filtro.</p>';
  for (const p of lista) {
    const cls = p.faixa === 'no ponto' ? 'tag--fogo' : p.faixa === 'talvez' ? 'tag--ambar' : '';
    const x = { nome: p.nome, end: '', avaliacoes: 0, nota: 0, soRede: true, insta: p.link };
    const msg = T.SO_REDE[Math.floor(Math.random() * 4)](x, -1);
    const div = document.createElement('div');
    div.className = 'card perfil-ig';
    div.innerHTML = `
      <div class="perfil-ig__topo">
        <div>
          <div class="tags"><span class="tag ${cls}">${esc(p.faixa)}</span>${p.seguidores != null ? '<span class="tag">' + num(p.seguidores) + ' seguidores</span>' : ''}</div>
          <h3 class="card__nome">${esc(p.nome)} <span class="small">@${esc(p.arroba)}</span></h3>
          <p class="perfil-ig__bio">${esc(p.bio || '')}</p>
          <div class="perfil-ig__porques">${(p.porques || []).map((q) => '<span class="tag">' + esc(q) + '</span>').join('')}</div>
        </div>
      </div>
      <div class="msg__acoes" style="margin-top:var(--sp-sm)">
        <a class="mini" target="_blank" rel="noopener" href="${esc(p.link)}">Abrir perfil ↗</a>
        <button class="mini" type="button" data-copiar>Copiar mensagem</button>
        <button class="mini" type="button" data-salvar>Salvar na minha lista</button>
      </div>`;
    $('[data-copiar]', div).onclick = () => copiar(msg, 'Mensagem copiada.');
    $('[data-salvar]', div).onclick = (e) => salvarLead({ chave: 'ig|' + p.arroba, nome: p.nome, insta: p.link, avaliacoes: p.seguidores, score: p.faixa === 'no ponto' ? 72 : 50, origem: 'instagram', situacao: 'só Instagram' }, e.currentTarget);
    raiz.appendChild(div);
  }
}

/* ============================================================
   Quem está contratando
   ============================================================ */
const inVagas = $('#vagas-termo');
function linkLinkedin() { $('#vagas-linkedin').href = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(inVagas.value.trim() || 'designer')}&f_WT=2&f_TPR=r604800`; }
inVagas.oninput = linkLinkedin; linkLinkedin();
$('#form-vagas').onsubmit = async (e) => {
  e.preventDefault();
  const btn = $('#vagas-buscar'); btn.disabled = true;
  const raiz = $('#vagas-lista');
  raiz.innerHTML = '<p class="diag__vazio"><span class="girando"></span> consultando as quatro fontes…</p>';
  try {
    const d = await api('/api/prospeccao/vagas?termo=' + encodeURIComponent(inVagas.value.trim()));
    const semana = Date.now() - 7 * 86400000;
    $('#vagas-kpis').hidden = false;
    $('#vk-total').textContent = d.total; $('#vk-salario').textContent = d.comSalario; $('#vk-fontes').textContent = (d.fontes || []).length;
    $('#vk-semana').textContent = (d.lista || []).filter((v) => v.data && new Date(v.data).getTime() > semana).length;
    raiz.innerHTML = (d.lista || []).length ? '' : '<p class="vazio">Nenhuma vaga com esse termo agora.</p>';
    for (const v of d.lista || []) {
      const div = document.createElement('div');
      div.className = 'vaga';
      div.innerHTML = `
        <div>
          <div class="vaga__cargo">${esc(v.cargo)}</div>
          <div class="vaga__empresa">${esc(v.empresa || '')}</div>
          <div class="vaga__meta">
            ${v.local ? '<span>' + esc(v.local) + '</span>' : ''}
            ${v.salario ? '<span><b>' + esc(v.salario) + '</b></span>' : ''}
            ${v.data ? '<span>' + new Date(v.data).toLocaleDateString('pt-BR') + '</span>' : ''}
            <span>${esc(v.fonte)}</span>
          </div>
          ${v.resumo ? '<p class="vaga__resumo">' + esc(v.resumo) + '</p>' : ''}
        </div>
        <a class="mini" target="_blank" rel="noopener" href="${esc(v.link)}">Ver vaga ↗</a>`;
      raiz.appendChild(div);
    }
  } catch (x) { raiz.innerHTML = `<p class="diag__vazio">Não consegui: ${esc(x.message)}</p>`; }
  finally { btn.disabled = false; }
};

/* ============================================================
   Início
   ============================================================ */
(async function iniciar() {
  desenharRadar();
  try {
    const [cfg, perfil, leads] = await Promise.all([
      api('/api/prospeccao/config'),
      api('/api/prospeccao/perfil'),
      api('/api/prospeccao/leads').then((d) => d.leads || []),
    ]);
    CONFIG = cfg; PERFIL = perfil; LEADS = leads;
  } catch (e) { if (!/sessão/.test(e.message)) avisar('Não carreguei a configuração: ' + e.message, 'erro'); }
  montarSelects();
  setModo('cidade');
  contarLeads();
  if (!CONFIG.instagram) $('#insta-semchave').hidden = false;
  restaurarBusca();
  let aba = 'mapa';
  try { aba = localStorage.getItem(CHAVE_ABA) || 'mapa'; } catch (e) { /* sem storage */ }
  irPara(['mapa', 'internet', 'vagas', 'lista'].includes(aba) ? aba : 'mapa');
  window.scrollTo(0, 0);
})();
