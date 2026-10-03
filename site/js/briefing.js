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
  $('#comecar').hidden = false;

  /* ---------- as telas ---------- */
  const telas = [];
  for (const bloco of $$('.pg-bloco', form)) {
    const nome = bloco.dataset.nome || '';
    const etapa = Number(bloco.dataset.etapa || 0);
    for (const campo of $$('.pg-campo', bloco)) telas.push({ campo, bloco, nome, etapa, seId: campo.dataset.seId, seValor: campo.dataset.seValor });
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
  const linkDe = (t) => t.campo.querySelector('[data-link-de]')?.value.trim() || '';
  const pular = criar('button', 'pg-pular', 'Pular: enviar depois pelo WhatsApp');
  pular.hidden = true;
  form.insertBefore(pular, barra);   // antes da barra fixa, que fica sempre no fim da tela

  /* ---------- revisão, montada no fim ---------- */
  const revisao = criar('section', 'pg-revisao');
  revisao.hidden = true;
  form.insertBefore(revisao, $('#erro'));

  /* ---------- pergunta condicional ----------
     "Mostrar só se a resposta de tal pergunta for Sim". Quem responde
     Não nunca vê a pergunta, e ela não vai para a revisão nem para o
     Samuel. */
  function ativa(t) {
    if (!t.seId) return true;
    return [...form.querySelectorAll(`[name="${CSS.escape(t.seId)}"]:checked`)].some((c) => c.value === t.seValor);
  }
  // Próxima tela que vale mostrar, andando para frente (1) ou para trás (-1).
  function proxima(de, passo) {
    let n = de + passo;
    while (n >= 0 && n < telas.length && !ativa(telas[n])) n += passo;
    return n < 0 ? -1 : Math.min(n, telas.length);
  }

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
    if (emCurso) animar(telas[i].campo);

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
      return t.campo.querySelector('.pg-upload__lista li') || linkDe(t) ? '' : 'Envie um arquivo ou cole um link para seguir.';
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
    mostrar(proxima(i, 1));
  }

  // Respondeu de verdade? Então o pulo anterior não vale mais.
  function temResposta(t) {
    if (t.campo.dataset.tipo === 'arquivo') return !!t.campo.querySelector('.pg-upload__lista li') || !!linkDe(t);
    return !!t.campo.querySelector('input:checked') || [...t.campo.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]),textarea')].some((c) => c.value.trim());
  }

  pular.onclick = () => {
    const id = nomeDe(telas[i]);
    if (pulos.has(id)) { pulos.delete(id); mostrar(i); return; }
    pulos.add(id);
    guardar();
    mostrar(proxima(i, 1));
  };

  seguir.onclick = avancar;
  voltar.onclick = () => mostrar(proxima(i, -1));
  $('#comecar').onclick = () => mostrar(proxima(-1, 1));

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
  const chaveEnvio = 'briefing-envio:' + location.pathname;

  /* Cada pessoa que abre o link tem um envio, com id sorteado aqui e
     guardado no navegador. Ele continua o mesmo ao recarregar e muda
     depois de enviado, então o mesmo link serve para várias respostas. */
  const novoEnvio = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  let envio;
  try { envio = localStorage.getItem(chaveEnvio); } catch (e) { /* sem armazenamento */ }
  if (!envio) { envio = novoEnvio(); try { localStorage.setItem(chaveEnvio, envio); } catch (e) { /* segue com o id da página */ } }

  // O andamento vai para o servidor: se a pessoa parar no meio, o Samuel
  // vê até onde ela chegou. Espera um instante para não mandar a cada tecla.
  let espera;
  function enviarAndamento(agora = false) {
    clearTimeout(espera);
    const mandar = () => {
      const v = valores();
      if (!Object.values(v).some((x) => String(x).trim())) return;
      fetch(location.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true, body: JSON.stringify({ envio, respostas: v }) }).catch(() => {});
    };
    if (agora) mandar(); else espera = setTimeout(mandar, 1500);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarAndamento(true); });

  function guardar() {
    try { localStorage.setItem(chave, JSON.stringify(valores())); } catch (e) { /* sem espaço: segue sem rascunho */ }
    enviarAndamento();
  }
  function valores() {
    const d = {};
    new FormData(form).forEach((v, k) => {
      if (v instanceof File) return;                    // arquivo tem lista própria
      d[k] = d[k] === undefined ? v : [].concat(d[k], v).join(', ');
    });
    for (const id of pulos) d[id] = TEXTO_PULO;
    // Arquivos e link viram uma resposta só: um por linha.
    for (const t of telas) {
      if (t.campo.dataset.tipo !== 'arquivo') continue;
      const id = nomeDe(t);
      const partes = [...(arquivos[id] || []).map((a) => a.nome + ' (' + location.origin + a.url + ')'), linkDe(t)].filter(Boolean);
      if (partes.length) d[id] = partes.join('\n');
    }
    for (const t of telas) if (!ativa(t)) delete d[nomeDe(t)];   // pergunta escondida não leva resposta velha
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
      } else if (campos[0].type === 'file') {
        // arquivo não volta do rascunho, mas o link sim
        const url = String(v).split('\n').find((l) => /^https?:\/\//i.test(l.trim()));
        const caixa = campos[0].closest('.pg-upload')?.querySelector('[data-link-de]');
        if (url && caixa) caixa.value = url.trim();
      } else campos[0].value = v;
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
      if (!ativa(t)) return;
      const nome = [...(t.campo.querySelector('label')?.childNodes || [])].filter((n) => n.nodeName !== 'SMALL').map((n) => n.textContent).join('').trim();
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
    const ruim = telas.findIndex((t) => ativa(t) && falta(t));
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
        body: JSON.stringify({ envio, respostas: valores(), concluir: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não consegui enviar. Tente de novo em instantes.');
      clearTimeout(espera);
      try { localStorage.removeItem(chave); localStorage.removeItem(chaveEnvio); } catch (x) { /* nada a limpar */ }
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

/* ---------- entrada de cada pergunta ----------
   O título "se escreve": cada palavra sobe de dentro de uma máscara,
   uma depois da outra. Depois entram a ajuda, o exemplo e o campo, e as
   opções caem em sequência. A palavra é dividida uma vez só por
   pergunta; o texto continua sendo o mesmo para leitor de tela. */
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;

function animar(campo) {
  if (SEM_MOVIMENTO) return;
  const rotulo = campo.querySelector('label');
  if (!rotulo) return;
  if (!rotulo.dataset.palavras) {
    const no = rotulo.firstChild;
    if (no && no.nodeType === 3) {
      const palavras = no.textContent.trim().split(/\s+/);
      const frag = document.createDocumentFragment();
      palavras.forEach((p, k) => {
        const fora = criar('span', 'pg-w');
        const dentro = criar('span', '', p);
        dentro.style.setProperty('--i', k);
        fora.append(dentro);
        frag.append(fora);
        if (k < palavras.length - 1) frag.append(' ');
      });
      rotulo.replaceChild(frag, no);
      rotulo.dataset.palavras = String(palavras.length);
    }
  }
  const n = Number(rotulo.dataset.palavras || 4);
  campo.style.setProperty('--base', (n * 55 + 160) + 'ms');
  campo.querySelectorAll('.pg-opcao').forEach((o, k) => o.style.setProperty('--k', Math.min(k, 12)));
  // reinicia a animação mesmo quando a pergunta já esteve na tela
  campo.classList.remove('digita');
  void campo.offsetWidth;
  campo.classList.add('digita');
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (tag === 'button') el.type = 'button';   // dentro do form, o padrão seria enviar
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}
