/* ============================================================
   Prospecção — o comportamento da tela.

   Quatro abas, sem roteador: a aba ativa é um atributo no
   <main>. O estado mora em variáveis soltas aqui em cima — é
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
let CONFIG = { mapas: 'osm', ia: false, instagram: false, pagespeedKey: '', nichos: [], paises: [] };
let PERFIL = { nome: 'Samuel Freire', faz: 'sites', cidade: '', zap: '' };
let RESULTADOS = [];          // negócios da última varredura
let CTX = {};                 // { termo, nicho, cidade, pais, fonte }
let FILTRO = 'todos';
let MODO = 'cidade';          // perto | cidade | brasil
let CIDADE_SEL = null;        // { rotulo, lat, lon }
let LEADS = [];
const DIAG = {};              // índice → diagnóstico do site
const MSG = {};               // índice → { texto, versao, ia }
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
   Perfil — quem assina
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
   Busca — "Quem está no mapa"
   ============================================================ */
const form = $('#form-busca');
const inNicho = $('#nicho'), inTermo = $('#termo'), inPais = $('#pais'), inCidade = $('#cidade'), inRaio = $('#raio');
const sugestoes = $('#sugestoes');

function montarSelects() {
  inNicho.innerHTML = CONFIG.nichos.map((n) => `<option value="${esc(n.id)}">${esc(n.pt)}</option>`).join('') + '<option value="outro">Outro nicho, eu escrevo</option>';
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
    CTX = { termo: rotuloNicho, nicho, cidade: d.lugar?.nome || '', pais: inPais.value, fonte: d.fonte, quando: Date.now() };
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
   Radar — gira enquanto o servidor não responde; ao responder
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
const TAG = (x) => x.semNada ? ['tag--fogo', 'sem site e sem rede'] : x.soRede ? ['tag--fogo', 'só Instagram/Facebook'] : ['tag--ambar', 'site pra avaliar'];
const ROTULO = (x) => x.semSite ? 'criar do zero' : 'refazer o site';

// Depois do diagnóstico, um site ruim vira oportunidade maior.
function scoreDe(i) {
  const x = RESULTADOS[i]; const d = DIAG[i];
  if (x.semSite || !d || d.nota == null) return x.score;
  return Math.min(100, x.score + (d.nota < 50 ? 18 : d.nota < 75 ? 8 : 0));
}
const faixaScore = (s) => s >= 70 ? 'alta' : s >= 45 ? 'media' : 'baixa';

function passaFiltro(i) {
  const x = RESULTADOS[i];
  if (FILTRO === 'sem') return x.semSite;
  if (FILTRO === 'com') return !x.semSite;
  if (FILTRO === 'quente') return scoreDe(i) >= 70;
  if (FILTRO === 'fone') return Boolean(x.fone);
  return true;
}

function pintarKpis() {
  $('#k-total').textContent = num(RESULTADOS.length);
  $('#k-sem').textContent = num(RESULTADOS.filter((x) => x.semSite).length);
  $('#k-quentes').textContent = num(RESULTADOS.filter((_, i) => scoreDe(i) >= 70).length);
  $('#k-fone').textContent = num(RESULTADOS.filter((x) => x.fone).length);
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
            ${x.fone ? '<span class="tag">tem telefone</span>' : ''}
            ${x.praca ? '<span class="tag">' + esc(x.praca) + '</span>' : ''}
          </div>
          <h3 class="card__nome">${esc(x.nome)}</h3>
          <p class="card__end">${esc(x.end || 'sem endereço')}</p>
          <p class="card__meta">
            ${x.nota ? '<span>★ <b>' + esc(x.nota) + '</b> · ' + num(x.avaliacoes) + ' avaliações</span>' : '<span>sem avaliações</span>'}
            ${x.fone ? '<span>' + esc(x.fone) + '</span>' : ''}
            ${x.tipo ? '<span>' + esc(x.tipo) + '</span>' : ''}
          </p>
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
  const idioma = idiomaDe(CTX.pais);
  corpo.innerHTML = `
    <div class="diag" data-diag>
      <p class="eyebrow">Diagnóstico do site</p>
      <div data-diag-corpo><p class="diag__vazio">${x.site ? '<span class="girando"></span> lendo ' + esc(x.site) : x.soRede ? 'Não tem site, só ' + esc(x.insta) : 'Não tem site nem rede. Aqui é criar do zero.'}</p></div>
      <div class="oque" data-oque></div>
    </div>
    <div class="msg">
      <div class="msg__topo"><p class="eyebrow">Mensagem</p><span class="msg__versao" data-versao></span></div>
      <textarea class="msg__texto" data-texto spellcheck="false"></textarea>
      <div class="msg__acoes">
        <button class="mini mini--ia" type="button" data-ia title="${CONFIG.ia ? 'Escreve uma mensagem nova com o Claude, usando as opiniões e o diagnóstico' : 'Defina ANTHROPIC_API_KEY na stack pra ligar'}" ${CONFIG.ia ? '' : 'disabled'}>Escrever com IA ✦</button>
        <button class="mini" type="button" data-trocar>Trocar versão ↻</button>
        <button class="mini" type="button" data-copiar>Copiar</button>
        <button class="mini" type="button" data-salvar>Salvar na minha lista</button>
        ${x.fone ? (idioma === 'pt' ? `<a class="mini" data-zap target="_blank" rel="noopener" href="${esc(linkZap(x, CTX.pais))}">WhatsApp ↗</a>` : `<a class="mini" href="tel:${esc((x.foneIntl ? '+' + x.foneIntl : x.fone))}">Ligar ↗</a>`) : ''}
        ${x.site ? `<a class="mini" target="_blank" rel="noopener" href="${esc(x.site)}">Abrir o site ↗</a>` : ''}
        ${x.insta ? `<a class="mini" target="_blank" rel="noopener" href="${esc(x.insta)}">Rede ↗</a>` : ''}
        <a class="mini" target="_blank" rel="noopener" href="${esc(x.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(x.nome + ' ' + (x.end || '')))}">Google ↗</a>
      </div>
    </div>`;

  const ta = $('[data-texto]', corpo);
  ta.oninput = () => { if (MSG[i]) MSG[i].texto = ta.value; const a = $('[data-zap]', corpo); if (a) a.href = linkZap(x, CTX.pais, ta.value); };
  $('[data-trocar]', corpo).onclick = () => { gerarMensagem(i, ((MSG[i]?.versao || 0) % 4) + 1); };
  $('[data-copiar]', corpo).onclick = () => copiar(ta.value, 'Mensagem copiada.');
  $('[data-salvar]', corpo).onclick = (e) => salvarLead(leadDe(x, i), e.currentTarget);
  $('[data-ia]', corpo).onclick = (e) => escreverComIa(i, e.currentTarget);

  gerarMensagem(i, 1);
  if (x.site) diagnosticar(i);
  else pintarOque(i);
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
  atualizarScore(i);
  if (MSG[i] && !MSG[i].ia) gerarMensagem(i, MSG[i].versao);
}

function pintarDiag(i) {
  const d = DIAG[i]; const el = elDiag(i); if (!el || !d) return;
  const faixa = d.nota == null ? '' : d.nota >= 75 ? 'bom' : d.nota >= 50 ? 'medio' : 'ruim';
  const porte = { pequeno: 'operação enxuta', medio: 'porte médio', grande: 'tem equipe' }[d.porte] || '';
  const sinais = (d.porte === 'grande' ? d.sinaisGrande : d.sinaisPequeno) || [];
  el.innerHTML = `
    <div class="diag__topo">
      <span class="diag__nota" data-faixa="${faixa}">${d.nota == null ? '-' : d.nota}</span>
      <span class="diag__meta">${d.nota == null ? '' : 'de 100'}${d.ms ? ' · abriu em ' + (d.ms / 1000).toFixed(1) + ' s' : ''}${d.kb ? ' · ' + d.kb + ' KB' : ''}${d.titulo ? ' · “' + esc(d.titulo.slice(0, 50)) + '”' : ''}</span>
    </div>
    ${d.problemas?.length ? '<ul>' + d.problemas.map((p) => '<li>' + esc(p.texto) + '</li>').join('') + '</ul>' : '<p class="diag__vazio">Nenhum problema grosseiro no primeiro olhar.</p>'}
    ${d.bons?.length ? '<ul>' + d.bons.map((b) => '<li class="bom">' + esc(b) + '</li>').join('') + '</ul>' : ''}
    ${porte ? '<p class="diag__porte">Porte: <b>' + porte + '</b>' + (sinais.length ? ' <span class="diag__sinais">· ' + esc(sinais.join(' · ')) + '</span>' : '') + '</p>' : ''}
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

/* PageSpeed sai direto do navegador: o Google leva 20–40 s e não
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
    atualizarScore(i);
    pintarOque(i);
    if (MSG[i] && !MSG[i].ia) gerarMensagem(i, MSG[i].versao);
    avisar('Análise profunda concluída.');
  } catch (e) {
    avisar('O Google não conseguiu analisar: ' + e.message, 'erro');
    btn.disabled = false; prog.hidden = true; txt.hidden = true;
  } finally { clearInterval(timer); }
}

/* ============================================================
   Mensagens — templates locais (sem custo)
   Estrutura: o que eu vi → o que isso custa → o que eu já fiz
   → fecho sem pedir permissão.
   ============================================================ */
const idiomaDe = (pais) => (!pais || pais === 'br' || pais === 'pt') ? 'pt' : 'en';
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
function repEn(x) {
  const av = Number(x.avaliacoes) || 0, n = Number(x.nota) || 0;
  if (n >= 4.5 && av >= 100) return `${av} reviews averaging ${n}`;
  if (av >= 40) return `${av} reviews`;
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
const soltoEn = () => ['No strings attached.', "If it's not useful, just ignore it.", 'Have a look and tell me what you think.'][Math.floor(Math.random() * 3)];
const assina = () => `\n\n${primeiroNome()}`;
const fazEn = () => ({ sites: 'websites', 'páginas': 'landing pages', 'sites e sistemas': 'websites and web apps', 'identidade visual': 'brand identity', design: 'design' }[PERFIL.faz] || 'websites');
const euCid = () => PERFIL.cidade ? ` aqui de ${PERFIL.cidade}` : '';

const T = {
  SEM_NADA: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Procurei ${curto(x.nome)} no Google${noBairro(x)} e só achei a ficha do Maps${rep(x) ? ' (' + rep(x) + ')' : ''}, nenhum site, nenhuma rede. Quem chega por indicação tenta confirmar antes de ligar e não tem pra onde ir; boa parte fecha a aba e liga pro que tem página. Montei uma página de uma dobra com o essencial de vocês pra você ver como ficaria. Te mando o link ainda hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}${euCid()}. Vi que ${curto(x.nome)}${noBairro(x)} vive de indicação${rep(x) ? ', e as ' + rep(x) + ' mostram que funciona' : ''}. Só que indicação tem teto: ela chega até onde a memória dos clientes alcança. Quem procura no Google não encontra vocês, encontra o concorrente. Já deixei pronta uma página simples, com as avaliações em destaque e botão de WhatsApp. Te mando pra você olhar. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}. Pesquisei ${curto(x.nome)}${noBairro(x)} e reparei que não há site nem rede, só o endereço. Quando o cliente não vê nada, ele não tem como comparar qualidade; sobra o preço, e aí quem cobra menos leva. Fiz uma primeira tela mostrando o que diferencia vocês${rep(x) ? ' (as ' + rep(x) + ' já contam metade da história)' : ''}. Te envio hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, ${PERFIL.faz}${euCid()}. Achei ${curto(x.nome)} no Maps${noBairro(x)}, sem site. Quem pesquisa no celular decide em menos de um minuto: abre dois ou três, escolhe o que passa mais confiança e chama. Sem página, vocês nem entram na comparação. Preparei uma versão de uma dobra pra vocês entrarem nela. Te mando o link ainda hoje. ${solto()}${assina()}`,
  ],
  SO_REDE: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Vi que ${curto(x.nome)}${noBairro(x)} atende pelo Instagram, e o perfil está bem cuidado${rep(x) ? ', ' + rep(x) + ' no Google' : ''}. O problema é que o direct fecha quando o expediente fecha: quem chama à noite espera até o dia seguinte e, nesse meio-tempo, fala com outro. Montei uma página de uma dobra que responde as três perguntas de sempre e manda pro WhatsApp. Te envio hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}. Achei ${curto(x.nome)} no Google${noBairro(x)} e o único endereço é o Instagram. Post some do feed em dois dias; página fica. Quem chega pelo Google hoje cai num perfil e precisa adivinhar o que vocês fazem, quanto custa e como chamar. Deixei pronta uma página que resolve isso numa tela. Te mando o link. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, ${PERFIL.faz}${euCid()}. Vi ${curto(x.nome)}${noBairro(x)} pelo Instagram${rep(x) ? ', ' + rep(x) + ' no Google, então o movimento é real' : ''}. Aposto que o direct repete a mesma conversa dez vezes por dia: horário, endereço, valor, "como funciona". Uma página responde isso antes de o cliente chamar, e o direct fica só pra quem já quer marcar. Já fiz uma primeira versão. Te mando hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, faço ${PERFIL.faz}. Passei pelo perfil de ${curto(x.nome)}${noBairro(x)}: pra entender o que vocês fazem e pra quem, precisei rolar uns quinze posts. Cliente novo não rola quinze posts: fecha e vai pro próximo. Montei uma página de captura pra bio: o que faz, pra quem, prova e botão. Te envio o link ainda hoje. ${solto()}${assina()}`,
  ],
  COM_SITE: [
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Abri o site de ${curto(x.nome)}${noBairro(x)} pelo celular e ele trabalha contra vocês: ${defeitos(i, 2) || 'demora pra abrir e não tem um botão de contato claro'}. Cada cliente que chega por indicação passa por ele antes de chamar, e alguns desistem ali. Refiz a primeira tela resolvendo isso. Te mando o link hoje pra você comparar lado a lado. ${solto()}${assina()}`,
    (x, i) => `${sc()} Aqui é ${primeiroNome()}, ${PERFIL.faz}. ${rep(x) ? 'Vocês têm ' + rep(x) + ' no Google' : 'Vocês têm avaliações no Google'}, e o site de ${curto(x.nome)} não mostra nenhuma. É a prova mais forte que vocês têm, escondida do lugar onde o cliente decide. Montei uma primeira tela com as avaliações em destaque e o WhatsApp a um toque. Te envio ainda hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} Sou ${primeiroNome()}, faço ${PERFIL.faz}${euCid()}. Passei pelo site de ${curto(x.nome)}${noBairro(x)} e tem um detalhe que provavelmente ninguém comentou: ${defeitos(i, 1) || 'ele não se adapta ao celular'}. Quem vê não avisa, só não chama. Já preparei uma versão corrigida da primeira tela pra você ver a diferença. Te mando o link hoje. ${solto()}${assina()}`,
    (x, i) => `${sc()} ${primeiroNome()} aqui, ${PERFIL.faz}${euCid()}. O site de ${curto(x.nome)}${noBairro(x)} parou no tempo${defeitos(i, 1) ? ' (' + defeitos(i, 1) + ')' : ''}, e o negócio não parou${rep(x) ? ' (' + rep(x) + ' dizem isso)' : ''}. Quando o site é de uma época e o serviço é de outra, o cliente desconfia do serviço, não do site. Refiz a primeira tela no padrão de hoje. Te mando pra comparar. ${solto()}${assina()}`,
  ],
  SEM_NADA_EN: [
    (x, i) => `Subject: ${curto(x.nome)} on Google Maps\n\nHi,\n\nI'm ${primeiroNome()}, I build ${fazEn()} for local businesses. I looked up ${curto(x.nome)} and found only the Maps listing${repEn(x) ? ' (' + repEn(x) + ')' : ''}, no website. People who get referred to you try to check you out first and have nowhere to go; many just call whoever has a page. I've already put together a one-screen page with your essentials. I'll send the link today. ${soltoEn()}\n\n${primeiroNome()}`,
    (x, i) => `Subject: quick one about ${curto(x.nome)}\n\nHi,\n\nI'm ${primeiroNome()}, a web designer. ${repEn(x) ? 'You have ' + repEn(x) + ' on Google' : 'You show up on Google'} but no site, so when someone searches, they land on a competitor's page instead of yours. I've drafted a simple page with your reviews up front and a contact button. Sending it over today so you can see it. ${soltoEn()}\n\n${primeiroNome()}`,
  ],
  SO_REDE_EN: [
    (x, i) => `Subject: your DMs close at 6\n\nHi,\n\nI'm ${primeiroNome()}, I build ${fazEn()}. ${curto(x.nome)} runs on Instagram${repEn(x) ? ', and ' + repEn(x) + ' on Google say it works' : ''}. The catch: DMs close when the day closes. Whoever messages at night waits until tomorrow and, in the meantime, talks to someone else. I made a one-screen page that answers the usual three questions and sends people straight to you. I'll send it today. ${soltoEn()}\n\n${primeiroNome()}`,
    (x, i) => `Subject: fifteen posts\n\nHi,\n\nI'm ${primeiroNome()}, a web designer. I went through ${curto(x.nome)}'s profile and needed to scroll about fifteen posts to understand what you do and for whom. New customers don't scroll fifteen posts: they close and move on. I built a link-in-bio page: what you do, who it's for, proof, one button. Link coming today. ${soltoEn()}\n\n${primeiroNome()}`,
  ],
  COM_SITE_EN: [
    (x, i) => `Subject: your site, on a phone\n\nHi,\n\nI'm ${primeiroNome()}, I build ${fazEn()}. I opened ${curto(x.nome)}'s website on my phone and it's working against you: ${defeitos(i, 2) || "it's slow and there's no clear way to get in touch"}. Every referral checks it before calling, and some give up right there. I redid the first screen to fix that. I'll send the link today so you can compare side by side. ${soltoEn()}\n\n${primeiroNome()}`,
    (x, i) => `Subject: the proof is hidden\n\nHi,\n\nI'm ${primeiroNome()}, a web designer. ${repEn(x) ? 'You have ' + repEn(x) + ' on Google' : 'You have Google reviews'}, and ${curto(x.nome)}'s site shows none of them. That's your strongest proof, hidden from the place where people decide. I built a first screen with the reviews up front and a contact button one tap away. Sending it today. ${soltoEn()}\n\n${primeiroNome()}`,
  ],
};

function banco(x, idioma) {
  const k = x.semNada ? 'SEM_NADA' : x.soRede ? 'SO_REDE' : 'COM_SITE';
  return T[idioma === 'en' ? k + '_EN' : k];
}

function gerarMensagem(i, versao) {
  const x = RESULTADOS[i];
  const b = banco(x, idiomaDe(CTX.pais));
  const v = ((versao - 1) % b.length) + 1;
  MSG[i] = { texto: b[v - 1](x, i), versao: v, ia: false };
  const corpo = $(`#cards .card[data-i="${i}"] .card__corpo`);
  if (!corpo) return;
  $('[data-texto]', corpo).value = MSG[i].texto;
  $('[data-versao]', corpo).textContent = `modelo · versão ${v} de ${b.length}`;
  const a = $('[data-zap]', corpo); if (a) a.href = linkZap(x, CTX.pais, MSG[i].texto);
  pintarOque(i);
}

function oque(i) {
  const x = RESULTADOS[i];
  if (x.semNada) return 'Página de uma dobra: o que fazem, pra quem, prova (as avaliações do Google) e botão de WhatsApp. Vira o destino da indicação e do Maps.';
  if (x.soRede) return 'Página de captura pra bio: o que faz, pra quem, prova e botão de WhatsApp. O direct deixa de ser o único caminho.';
  const d = defeitos(i, 3);
  return d ? `Primeira tela refeita resolvendo: ${d}.` : 'Primeira tela refeita: promessa clara, prova em destaque e contato a um toque.';
}
function pintarOque(i) {
  const el = $(`#cards .card[data-i="${i}"] [data-oque]`);
  if (el) el.innerHTML = '<b>O que recriar</b>' + esc(oque(i));
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
      variacao, idioma: idiomaDe(CTX.pais),
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
$('#copiar-lista').onclick = () => {
  const linhas = visiveis().map(([x, i]) => [x.nome, x.end, x.fone || '', x.site || x.insta || '', ROTULO(x), scoreDe(i), x.nota || '', x.avaliacoes || ''].join(' · '));
  copiar(linhas.join('\n'), `${linhas.length} linhas copiadas.`);
};
$('#baixar-csv').onclick = () => {
  const cel = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const linhas = [['nome', 'endereco', 'telefone', 'site', 'o_que_fazer', 'oportunidade', 'nota', 'avaliacoes'].join(';')];
  for (const [x, i] of visiveis()) linhas.push([x.nome, x.end, x.fone, x.site || x.insta, ROTULO(x), scoreDe(i), x.nota, x.avaliacoes].map(cel).join(';'));
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prospeccao-${(CTX.cidade || 'lista').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/* ============================================================
   Leads — "Minha lista"
   ============================================================ */
function leadDe(x, i) {
  return {
    chave: (x.nome + '|' + (x.end || '')).toLowerCase().slice(0, 180),
    nome: x.nome, endereco: x.end, fone: x.fone, foneIntl: x.foneIntl, site: x.site, insta: x.insta, maps: x.maps,
    nota: x.nota, avaliacoes: x.avaliacoes, score: scoreDe(i), cidade: CTX.cidade, pais: CTX.pais || 'br', origem: 'mapa',
    situacao: x.semNada ? 'sem site e sem rede' : x.soRede ? 'só rede social' : 'site pra refazer',
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
          ${l.cidade ? '<span>' + esc(l.cidade) + '</span>' : ''}
          ${l.ultimo_toque ? '<span>toque ' + new Date(l.ultimo_toque).toLocaleDateString('pt-BR') + '</span>' : ''}
        </div>
      </div>
      <select data-estado>${['mira', 'abordado', 'respondeu', 'proposta', 'fechado', 'descartado'].map((e) => `<option value="${e}" ${e === l.estado ? 'selected' : ''}>${NOME_ETAPA[e]}</option>`).join('')}</select>
      <textarea data-anot placeholder="Anotação (salva sozinha)">${esc(l.anotacao || '')}</textarea>
      <div class="lead-card__acoes">
        ${l.fone ? `<a class="mini" target="_blank" rel="noopener" href="${esc(linkZap(x, l.pais))}">WhatsApp ↗</a>` : ''}
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
/* (a) anunciantes: só o link da Biblioteca — a Meta não abre API fora da Europa */
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
