/* ============================================================
   Editor visual.

   Roda no painel, não no site. O script é injetado dentro do
   quadro (iframe) a partir daqui — o site publicado não carrega
   nada disto, e quem visita nunca recebe uma linha de editor.

   Só é possível porque o painel e o site estão no mesmo domínio.

   Duas ferramentas de texto, e só duas: quebra de linha e
   tamanho. As duas valem para o dispositivo selecionado no
   painel (PC ou Celular), independentes uma da outra:
     · quebra   → <br class="so-pc"> ou <br class="so-celular">
     · tamanho  → conteudo.estilos[chave][pc|celular] = "34px",
                  que o servidor vira <style> ao servir a página
   ============================================================ */

const LARGURA_CELULAR = '640px';
const LARGURA_PC = '641px';

export function ligarEditor(quadro, aoMudar, aoPedirImagem, opcoes = {}) {
  const doc = quadro.contentDocument;
  if (!doc) return null;
  const win = quadro.contentWindow;
  const dispositivo = opcoes.dispositivo || (() => 'pc');
  const estilos = opcoes.estilos || (() => ({}));
  const aoMudarEstilo = opcoes.aoMudarEstilo || (() => {});

  /* ---- estilos das marcações, dentro do quadro ---- */
  const css = doc.createElement('style');
  css.textContent = `
    [data-edit], [data-edit-img] {
      outline: 1px dashed rgba(255,79,24,.55);
      outline-offset: 3px;
      cursor: text;
      transition: outline-color .12s, background .12s;
    }
    [data-edit-img] { cursor: pointer; }
    [data-edit]:hover, [data-edit-img]:hover {
      outline: 2px solid #FF4F18;
      background: rgba(255,79,24,.06);
    }
    [data-edit][contenteditable="true"] {
      outline: 2px solid #FF4F18;
      background: rgba(255,79,24,.08);
    }
    [data-edit]:focus-visible { outline: 2px solid #FF4F18; }
    /* a rolagem inercial atrapalha quem está editando */
    html.lenis, html.lenis body { height: auto !important; }

    /* quebras por dispositivo ficam visíveis enquanto se edita */
    [contenteditable="true"] br.so-pc::before,
    [contenteditable="true"] br.so-celular::before { content: ""; }

    /* ---- barra de ferramentas ---- */
    #barra-texto {
      position: fixed; z-index: 2147483647;
      display: none; align-items: center; gap: 4px;
      padding: 4px; border-radius: 100px;
      background: #141517; color: #fff;
      font: 600 12px/1 Manrope, ui-sans-serif, system-ui, sans-serif;
      box-shadow: 0 6px 24px rgba(20,21,23,.28);
      white-space: nowrap; user-select: none; -webkit-user-select: none;
    }
    #barra-texto.mostra { display: flex; }
    #barra-texto .rot {
      padding: 0 10px 0 12px; color: rgba(255,255,255,.62);
      letter-spacing: .14em; text-transform: uppercase; font-size: 10px;
    }
    #barra-texto .rot b { color: #FF4F18; }
    #barra-texto button {
      padding: 8px 12px; border: 0; border-radius: 100px;
      background: rgba(255,255,255,.1); color: #fff; font: inherit; cursor: pointer;
    }
    #barra-texto button:hover { background: #FF4F18; }
    #barra-texto button.tam { min-width: 38px; font-weight: 800; }
    #barra-texto .px { min-width: 44px; text-align: center; color: rgba(255,255,255,.62); font-variant-numeric: tabular-nums; }
  `;
  doc.head.appendChild(css);

  // Tamanhos já salvos (ou editados e ainda não salvos) valem aqui
  // dentro também — regenerado a cada mudança.
  const estiloVivo = doc.createElement('style');
  estiloVivo.id = 'estilos-editor';
  doc.head.appendChild(estiloVivo);
  function pintarEstilos() {
    const est = estilos();
    const pc = [], cel = [];
    for (const [chave, e] of Object.entries(est)) {
      if (e.pc) pc.push(`[data-edit="${chave}"]{font-size:${e.pc} !important}`);
      if (e.celular) cel.push(`[data-edit="${chave}"]{font-size:${e.celular} !important}`);
    }
    estiloVivo.textContent = (pc.length ? `@media (min-width:${LARGURA_PC}){${pc.join('')}}` : '')
      + (cel.length ? `@media (max-width:${LARGURA_CELULAR}){${cel.join('')}}` : '');
  }
  pintarEstilos();

  // Editando, nada pode estar invisível esperando entrar em cena — nem a
  // rolagem pode ter inércia, que rouba o clique e a seleção de texto.
  for (const el of doc.querySelectorAll('.reveal')) el.classList.add('vis');

  // O Lenis rouba o clique e a seleção de texto: fora com ele aqui.
  try { win.lenis?.destroy(); } catch (e) {}

  /* ---- barra de ferramentas ---- */
  const barra = doc.createElement('div');
  barra.id = 'barra-texto';
  barra.innerHTML = `
    <span class="rot">Editando <b data-disp>PC</b></span>
    <button type="button" data-acao="quebra" title="Quebra de linha só neste dispositivo">&#8629; Quebra</button>
    <button type="button" class="tam" data-acao="menor" title="Texto menor">A&minus;</button>
    <span class="px" data-px>-</span>
    <button type="button" class="tam" data-acao="maior" title="Texto maior">A+</button>
    <button type="button" data-acao="padrao" title="Volta ao tamanho original neste dispositivo">Padr&atilde;o</button>
    <button type="button" data-acao="pronto">Pronto</button>
  `;
  doc.body.appendChild(barra);

  let ativo = null;   // o [data-edit] em edição

  function rotulo() {
    barra.querySelector('[data-disp]').textContent = dispositivo() === 'celular' ? 'Celular' : 'PC';
  }
  function mostrarPx() {
    if (!ativo) return;
    const px = parseFloat(win.getComputedStyle(ativo).fontSize);
    barra.querySelector('[data-px]').textContent = Math.round(px) + 'px';
  }
  function posicionar() {
    if (!ativo) return;
    const r = ativo.getBoundingClientRect();
    const alt = barra.offsetHeight || 40;
    let top = r.top - alt - 10;
    if (top < 8) top = Math.min(r.bottom + 10, win.innerHeight - alt - 8);
    let left = r.left;
    const larg = barra.offsetWidth;
    if (left + larg > win.innerWidth - 8) left = Math.max(8, win.innerWidth - larg - 8);
    barra.style.top = top + 'px';
    barra.style.left = left + 'px';
  }
  function abrirBarra(el) {
    ativo = el;
    rotulo(); mostrarPx();
    barra.classList.add('mostra');
    posicionar();
  }
  function fecharBarra() {
    ativo = null;
    barra.classList.remove('mostra');
  }
  win.addEventListener('scroll', posicionar, { passive: true });
  win.addEventListener('resize', posicionar, { passive: true });
  win.addEventListener('painel:dispositivo', () => { rotulo(); mostrarPx(); posicionar(); });

  // mousedown com preventDefault: o clique na barra não tira o foco
  // do texto nem desfaz a seleção — é o que permite inserir no cursor.
  barra.addEventListener('mousedown', (e) => e.preventDefault());
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !ativo) return;
    const acao = b.dataset.acao;
    const disp = dispositivo();
    const chave = ativo.getAttribute('data-edit');

    if (acao === 'quebra') {
      const sel = win.getSelection();
      if (!sel || !sel.rangeCount || !ativo.contains(sel.anchorNode)) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const br = doc.createElement('br');
      br.className = disp === 'celular' ? 'so-celular' : 'so-pc';
      range.insertNode(br);
      // cursor logo depois da quebra
      range.setStartAfter(br); range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range);
      registrar(ativo);
      posicionar();
    }

    if (acao === 'menor' || acao === 'maior') {
      const atual = parseFloat(win.getComputedStyle(ativo).fontSize);
      const novo = Math.max(8, Math.round(atual * (acao === 'maior' ? 1.08 : 0.92) * 10) / 10);
      aoMudarEstilo(chave, disp, novo + 'px');
      pintarEstilos(); mostrarPx(); posicionar();
    }

    if (acao === 'padrao') {
      aoMudarEstilo(chave, disp, null);
      pintarEstilos(); mostrarPx(); posicionar();
    }

    if (acao === 'pronto') ativo.blur();
  });

  /* ---- textos ---- */
  function registrar(el) {
    // <div> e <br> que o navegador insere viram <br> simples; as
    // quebras por dispositivo (com classe) passam intactas.
    const html = el.innerHTML
      .replace(/<div><br><\/div>/gi, '<br>')
      .replace(/<\/div><div>/gi, '<br>')
      .replace(/<\/?div>/gi, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    aoMudar(el.getAttribute('data-edit'), html);
  }

  for (const el of doc.querySelectorAll('[data-edit]')) {
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el.getAttribute('contenteditable') === 'true') return;
      el.setAttribute('contenteditable', 'true');
      el.focus();
      abrirBarra(el);
    });
    el.addEventListener('input', () => { registrar(el); posicionar(); });
    el.addEventListener('blur', () => {
      el.removeAttribute('contenteditable');
      registrar(el);
      if (ativo === el) fecharBarra();
    });
    // Enter não deve criar parágrafo, só quebra de linha (nos dois)
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { el.blur(); }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        doc.execCommand('insertLineBreak');
      }
    });
  }

  /* ---- imagens ---- */
  for (const img of doc.querySelectorAll('[data-edit-img]')) {
    img.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = await aoPedirImagem(img.getAttribute('data-edit-img'), img.src);
      if (url) { img.src = url; }
    });
  }

  /* ---- links não navegam enquanto se edita ---- */
  for (const a of doc.querySelectorAll('a')) {
    a.addEventListener('click', (e) => {
      if (!a.closest('[data-edit]')) e.preventDefault();
    });
  }

  return {
    textos: doc.querySelectorAll('[data-edit]').length,
    imagens: doc.querySelectorAll('[data-edit-img]').length,
  };
}
