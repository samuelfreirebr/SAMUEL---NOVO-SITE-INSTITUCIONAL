/* ============================================================
   Briefing: o formulário vira quiz.

   A página chega do servidor como um formulário inteiro, visível e
   legível sem JavaScript. Este arquivo não cria conteúdo: ele pega
   o que já está lá e mostra uma pergunta por vez, com a etapa no
   topo e a régua de progresso andando.

   Nada de framework. O que guarda a resposta continua sendo o
   próprio campo do formulário; o quiz só decide qual aparece.
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const form = $('#form');
const capa = $('#capa');
if (form && capa && !form.hidden) montar();

function montar() {
  document.body.classList.add('quiz');
  $('#conta').hidden = false;
  $('#comecar').hidden = false;

  /* ---------- as telas ---------- */
  const telas = [];
  for (const bloco of $$('.pg-bloco', form)) {
    const nome = bloco.dataset.nome || '';
    const etapa = Number(bloco.dataset.etapa || 0);
    for (const campo of $$('.pg-campo', bloco)) telas.push({ campo, bloco, nome, etapa });
  }
  if (!telas.length) return;

  const etapas = [...new Set(telas.map((t) => t.etapa))].length;
  const rotulo = $('#passo');
  const regua = $('#regua');
  const cheia = $('#regua-cheia');
  const erro = $('#erro');

  /* ---------- barra de navegação ---------- */
  const voltar = criar('button', 'mini pg-voltar', 'Voltar');
  const seguir = criar('button', 'btn btn--brand pg-avancar', 'Continuar');
  const dicaTecla = criar('span', 'pg-nota pg-tecla', 'Enter para continuar');
  const barra = criar('div', 'pg-barra');
  barra.append(voltar, seguir, dicaTecla);
  form.append(barra);

  /* ---------- pular: "envio depois pelo WhatsApp" ----------
     Só nas perguntas que o Samuel marcou. Vale mesmo para obrigatória:
     o que trava o cliente aqui ele resolve na conversa. */
  const TEXTO_PULO = 'Vai enviar depois pelo WhatsApp';
  const pulos = new Set();
  const nomeDe = (t) => t.campo.querySelector('[name]')?.name;
  const pular = criar('button', 'pg-pular', 'Pular: enviar depois pelo WhatsApp');
  pular.hidden = true;
  form.append(pular);

  /* ---------- revisão, montada no fim ---------- */
  const revisao = criar('section', 'pg-revisao');
  revisao.hidden = true;
  form.insertBefore(revisao, $('#erro'));

  let i = -1;                      // -1 é a capa, telas.length é a revisão
  const ultima = telas.length;

  function mostrar(n, foco = true) {
    i = Math.max(-1, Math.min(ultima, n));
    erro.hidden = true;

    capa.hidden = i !== -1;
    revisao.hidden = i !== ultima;
    if (i === ultima) pintarRevisao();

    for (const t of telas) t.campo.classList.toggle('ativa', telas[i] === t);
    for (const t of telas) t.bloco.classList.toggle('ativo', telas[i]?.bloco === t.bloco);

    barra.hidden = i === -1;
    pular.hidden = !(i >= 0 && i < ultima && telas[i].campo.dataset.pular === '1');
    if (!pular.hidden) pular.textContent = pulos.has(nomeDe(telas[i])) ? 'Desfazer: vou responder aqui' : 'Pular: enviar depois pelo WhatsApp';
    $('#acoes-fim').hidden = i !== ultima;
    voltar.hidden = i <= 0 && i !== ultima;
    seguir.hidden = i === ultima;

    const emCurso = i >= 0 && i < ultima;
    rotulo.hidden = !emCurso;
    regua.hidden = i === -1;
    if (emCurso) {
      const t = telas[i];
      rotulo.innerHTML = `<b>Etapa ${t.etapa + 1} de ${etapas}</b><span>${t.nome}</span>`;
    }
    cheia.style.transform = `scaleX(${(i + 1) / (ultima + 1)})`;

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (foco && emCurso) {
      const alvo = telas[i].campo.querySelector('input:not([type=hidden]), textarea, button');
      if (alvo && alvo.type !== 'radio' && alvo.type !== 'checkbox') alvo.focus({ preventScroll: true });
    }
  }

  /* ---------- validação de uma tela ---------- */
  function falta(t) {
    if (pulos.has(nomeDe(t))) return '';
    if (t.campo.dataset.obrigatoria !== '1') return '';
    const tipo = t.campo.dataset.tipo;
    if (tipo === 'arquivo') {
      return t.campo.querySelector('.pg-upload__lista li') ? '' : 'Mande pelo menos um arquivo para seguir.';
    }
    if (tipo === 'escolha' || tipo === 'varias') {
      return t.campo.querySelector('input:checked') ? '' : 'Escolha uma opção para seguir.';
    }
    const c = t.campo.querySelector('input, textarea');
    if (!c) return '';
    if (!c.value.trim()) return 'Esta resposta é necessária para começar o projeto.';
    if (!c.checkValidity()) return tipo === 'email' ? 'Confira o e-mail: parece faltar alguma coisa.'
      : tipo === 'link' ? 'Cole o endereço completo, começando com https://' : 'Confira a resposta.';
    return '';
  }

  function avancar() {
    const m = i >= 0 && i < ultima ? falta(telas[i]) : '';
    if (m) {
      erro.textContent = m; erro.hidden = false;
      telas[i].campo.classList.add('tremer');
      setTimeout(() => telas[i].campo.classList.remove('tremer'), 420);
      return;
    }
    if (i >= 0 && i < ultima && temResposta(telas[i])) pulos.delete(nomeDe(telas[i]));
    guardar();
    mostrar(i + 1);
  }

  // Respondeu de verdade? Então o pulo anterior não vale mais.
  function temResposta(t) {
    if (t.campo.dataset.tipo === 'arquivo') return !!t.campo.querySelector('.pg-upload__lista li');
    return !!t.campo.querySelector('input:checked') || [...t.campo.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]),textarea')].some((c) => c.value.trim());
  }

  pular.onclick = () => {
    const id = nomeDe(telas[i]);
    if (pulos.has(id)) { pulos.delete(id); mostrar(i); return; }
    pulos.add(id);
    guardar();
    mostrar(i + 1);
  };

  seguir.onclick = avancar;
  voltar.onclick = () => mostrar(i - 1);
  $('#comecar').onclick = () => mostrar(0);

  // Enter avança, menos dentro de texto longo (lá ele quebra linha).
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (i >= 0 && i < ultima) avancar();
  });

  /* ---------- rascunho no navegador ----------
     Formulário longo com aba fechada no meio não pode começar do
     zero. Fica só neste navegador, nada vai para o servidor antes
     de enviar. */
  const chave = 'briefing:' + location.pathname;
  function guardar() {
    try { localStorage.setItem(chave, JSON.stringify(valores())); } catch (e) { /* sem espaço: segue sem rascunho */ }
  }
  function valores() {
    const d = {};
    new FormData(form).forEach((v, k) => {
      if (v instanceof File) return;                    // arquivo tem lista própria
      d[k] = d[k] === undefined ? v : [].concat(d[k], v).join(', ');
    });
    for (const id of pulos) d[id] = TEXTO_PULO;
    for (const [id, lista] of Object.entries(arquivos)) {
      if (lista.length) d[id] = lista.map((a) => a.nome + ' (' + location.origin + a.url + ')').join('\n');
    }
    return d;
  }
  try {
    const salvo = JSON.parse(localStorage.getItem(chave) || '{}');
    for (const [k, v] of Object.entries(salvo)) {
      if (v === TEXTO_PULO) { pulos.add(k); continue; }
      const campos = $$(`[name="${CSS.escape(k)}"]`, form);
      if (!campos.length) continue;
      if (campos[0].type === 'radio' || campos[0].type === 'checkbox') {
        const marcadas = String(v).split(', ');
        for (const c of campos) c.checked = marcadas.includes(c.value);
      } else if (campos[0].type !== 'file') campos[0].value = v;
    }
  } catch (e) { /* rascunho torto: ignora */ }
  form.addEventListener('change', guardar);

  /* ---------- arquivos ---------- */
  const arquivos = {};
  for (const caixa of $$('.pg-upload', form)) ligarUpload(caixa);

  function ligarUpload(caixa) {
    const id = caixa.dataset.upload;
    const input = $('input[type=file]', caixa);
    const alvo = $('.pg-upload__alvo', caixa);
    const lista = $('.pg-upload__lista', caixa);
    arquivos[id] = [];

    alvo.onclick = () => input.click();
    input.onchange = () => { subir([...input.files]); input.value = ''; };

    for (const ev of ['dragenter', 'dragover']) {
      caixa.addEventListener(ev, (e) => { e.preventDefault(); caixa.classList.add('solta'); });
    }
    for (const ev of ['dragleave', 'drop']) {
      caixa.addEventListener(ev, (e) => { e.preventDefault(); caixa.classList.remove('solta'); });
    }
    caixa.addEventListener('drop', (e) => subir([...(e.dataTransfer?.files || [])]));

    async function subir(files) {
      for (const file of files) {
        const item = criar('li', 'pg-arq pg-arq--subindo', file.name);
        lista.append(item);
        try {
          const fd = new FormData();
          fd.append('arquivo', file);
          fd.append('campo', id);
          const r = await fetch(location.pathname + '/arquivos', { method: 'POST', body: fd });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.erro || 'Não consegui subir este arquivo.');
          arquivos[id].push({ nome: d.nome, url: d.url });
          item.className = 'pg-arq';
          item.textContent = '';
          item.append(criar('b', '', d.nome), botaoTirar(id, d, item, lista));
          guardar();
        } catch (x) {
          item.className = 'pg-arq pg-arq--erro';
          item.textContent = file.name + ': ' + x.message;
        }
      }
    }
  }

  function botaoTirar(id, arq, item, lista) {
    const b = criar('button', 'pg-arq__tirar', '×');
    b.type = 'button';
    b.setAttribute('aria-label', 'Tirar ' + arq.nome);
    b.onclick = () => {
      arquivos[id] = arquivos[id].filter((a) => a.url !== arq.url);
      item.remove();
      if (!lista.children.length) guardar();
      guardar();
    };
    return b;
  }

  /* ---------- revisão ---------- */
  function pintarRevisao() {
    revisao.innerHTML = '';
    revisao.append(criar('p', 'eyebrow pg-eyebrow', 'Quase lá'));
    revisao.append(criar('p', 'pg-revisao__t', 'Confira antes de enviar'));
    const d = valores();
    telas.forEach((t, n) => {
      const nome = t.campo.querySelector('label')?.firstChild?.textContent?.trim() || '';
      const id = t.campo.querySelector('[name]')?.name;
      const resp = (d[id] || '').trim();
      const linha = criar('div', 'pg-revisao__item');
      linha.append(criar('b', '', nome));
      linha.append(criar('p', resp ? '' : 'pg-revisao__vazio', resp || 'Sem resposta'));
      const ed = criar('button', 'mini', 'Editar');
      ed.type = 'button';
      ed.onclick = () => mostrar(n);
      linha.append(ed);
      revisao.append(linha);
    });
  }

  /* ---------- enviar ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.hidden = true;
    const ruim = telas.findIndex((t) => falta(t));
    if (ruim >= 0) {
      mostrar(ruim);
      erro.textContent = falta(telas[ruim]);
      erro.hidden = false;
      return;
    }
    const botao = $('#enviar');
    botao.disabled = true; botao.textContent = 'Enviando…';
    try {
      const r = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ respostas: valores() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não consegui enviar. Tente de novo em instantes.');
      try { localStorage.removeItem(chave); } catch (x) { /* nada a limpar */ }
      form.hidden = true;
      capa.hidden = true;
      regua.hidden = true; rotulo.hidden = true;
      $('#feito').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      erro.textContent = x.message;
      erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Enviar as informações';
    }
  });

  mostrar(-1, false);
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (tag === 'button') el.type = 'button';   // dentro do form, o padrão seria enviar
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}
