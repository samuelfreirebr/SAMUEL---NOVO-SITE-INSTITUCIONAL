/* ============================================================
   Editor visual.

   Roda no painel, não no site. O script é injetado dentro do
   quadro (iframe) a partir daqui — o site publicado não carrega
   nada disto, e quem visita nunca recebe uma linha de editor.

   Só é possível porque o painel e o site estão no mesmo domínio.
   ============================================================ */

export function ligarEditor(quadro, aoMudar, aoPedirImagem) {
  const doc = quadro.contentDocument;
  if (!doc) return null;

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
  `;
  doc.head.appendChild(css);

  // Editando, nada pode estar invisível esperando entrar em cena — nem a
  // rolagem pode ter inércia, que rouba o clique e a seleção de texto.
  for (const el of doc.querySelectorAll('.reveal')) el.classList.add('vis');

  // O Lenis rouba o clique e a seleção de texto: fora com ele aqui.
  try { quadro.contentWindow.lenis?.destroy(); } catch (e) {}

  /* ---- textos ---- */
  for (const el of doc.querySelectorAll('[data-edit]')) {
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el.getAttribute('contenteditable') === 'true') return;
      el.setAttribute('contenteditable', 'true');
      el.focus();
    });
    el.addEventListener('blur', () => {
      el.removeAttribute('contenteditable');
      // <div> e <br> que o navegador insere viram <br> simples
      const html = el.innerHTML
        .replace(/<div><br><\/div>/gi, '<br>')
        .replace(/<\/div><div>/gi, '<br>')
        .replace(/<\/?div>/gi, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      aoMudar(el.getAttribute('data-edit'), html);
    });
    // Enter não deve criar parágrafo, só quebra de linha
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
