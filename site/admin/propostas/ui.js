/* ============================================================
   Peças do editor de propostas.

   Cada campo nasce já ligado ao objeto que edita: escreveu, o valor
   vai para o objeto e o editor é avisado (ctx.mudou), que salva o
   estado de "alterado" e pede a prévia nova. Nada de caminho em
   texto ("contato.link") para procurar depois.
   ============================================================ */

export const ctx = {
  mudou: () => {},        // o editor troca por uma função de verdade
  icones: [],             // [{ nome, rotulo, svg }]
  pistas: [],             // [[RegExp, nome]]
  escolherImagem: async () => null,
};

/* ---------- DOM ---------- */
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === undefined || f === null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export const clonar = (o) => JSON.parse(JSON.stringify(o ?? null));
export const paraLinhas = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

/* ---------- campos ---------- */

// Texto de uma linha ou área. `obj[chave]` é lido e escrito.
export function texto(obj, chave, rotulo, { dica, area, linhas = 3, tipo = 'text', placeholder, aoMudar } = {}) {
  const valor = obj[chave] ?? '';
  const campo = area
    ? h('textarea', { rows: linhas, placeholder })
    : h('input', { type: tipo, placeholder });
  campo.value = valor;
  campo.addEventListener('input', () => {
    obj[chave] = tipo === 'number' ? (campo.value === '' ? 0 : Number(campo.value)) : campo.value;
    aoMudar?.(obj[chave]);
    ctx.mudou();
  });
  return h('label', { class: 'ed-campo' },
    h('span', { class: 'ed-campo__rot' }, rotulo),
    campo,
    dica && h('small', { class: 'ed-campo__dica' }, dica));
}

// Lista de textos, um por linha, guardada como array.
export function linhas(obj, chave, rotulo, { dica = 'Um item por linha.', linhas: n = 6 } = {}) {
  const campo = h('textarea', { rows: n });
  campo.value = (Array.isArray(obj[chave]) ? obj[chave] : []).join('\n');
  campo.addEventListener('input', () => { obj[chave] = paraLinhas(campo.value); ctx.mudou(); });
  return h('label', { class: 'ed-campo' },
    h('span', { class: 'ed-campo__rot' }, rotulo), campo,
    dica && h('small', { class: 'ed-campo__dica' }, dica));
}

export const linha = (...campos) => h('div', { class: 'ed-linha ed-linha--' + campos.filter(Boolean).length }, campos);

/* ---------- ligar e desligar ----------
   `ler()` diz o estado; `escrever(bool)` grava. O rótulo explica o
   que some da página quando desliga. */
export function chave({ rotulo, dica, ler, escrever, grande = false }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = ler();
  const el = h('label', { class: 'ed-chave' + (grande ? ' ed-chave--grande' : '') },
    input,
    h('span', { class: 'ed-chave__trilho', 'aria-hidden': 'true' }),
    h('span', { class: 'ed-chave__txt' },
      h('b', {}, rotulo),
      dica && h('small', {}, dica)));
  input.addEventListener('change', () => { escrever(input.checked); ctx.mudou(); el.dispatchEvent(new CustomEvent('trocou', { detail: input.checked, bubbles: true })); });
  return el;
}

// p.visivel guarda só o que está desligado; ligar tudo de novo apaga
// o objeto, para a proposta voltar a ser igual à que estava salva.
export function ligarParte(p, parte, ligada) {
  p.visivel ||= {};
  if (ligada) delete p.visivel[parte]; else p.visivel[parte] = false;
  if (!Object.keys(p.visivel).length) delete p.visivel;
}

// Chave que liga uma parte da página (p.visivel[parte]) e esmaece o
// bloco que depende dela. Desligar não apaga nada.
export function chaveParte(p, parte, rotulo, dica, bloco) {
  const ler = () => p.visivel?.[parte] !== false;
  const aplicar = () => bloco?.classList.toggle('ed-desligado', !ler());
  const el = chave({
    rotulo, dica, ler,
    escrever: (v) => { ligarParte(p, parte, v); aplicar(); },
  });
  aplicar();
  return el;
}

/* ---------- blocos ---------- */
export function bloco(titulo, { dica, acao, filhos = [], classe = '' } = {}) {
  return h('section', { class: 'ed-bloco ' + classe },
    (titulo || acao) && h('header', { class: 'ed-bloco__cab' },
      h('div', {}, titulo && h('h3', { class: 'ed-bloco__titulo' }, titulo), dica && h('p', { class: 'ed-bloco__dica' }, dica)),
      acao),
    h('div', { class: 'ed-bloco__corpo' }, filhos));
}

/* Bloco com chave no cabeçalho: desligado, o corpo esmaece. */
export function blocoParte(p, parte, titulo, dicaLigado, filhos) {
  const corpo = h('div', { class: 'ed-bloco__corpo' }, filhos);
  const el = h('section', { class: 'ed-bloco' },
    h('header', { class: 'ed-bloco__cab' },
      h('div', {}, h('h3', { class: 'ed-bloco__titulo' }, titulo)),
      chaveParte(p, parte, 'Mostrar', dicaLigado, corpo)),
    corpo);
  return el;
}

/* ---------- lista repetível ----------
   Cada item é um cartão que abre e fecha. O resumo mostra o título
   do item (e o ícone, quando há), para achar sem abrir todos. */
export function repetidor({ lista, nome, novo, resumo, montar, icone: comIcone, max }) {
  const raiz = h('div', { class: 'ed-rep' });
  let aberto = -1;

  function pintar() {
    raiz.innerHTML = '';
    if (!lista.length) raiz.append(h('p', { class: 'ed-vazio' }, 'Nenhum item. Adicione abaixo.'));
    lista.forEach((item, i) => {
      const ico = comIcone && h('span', { class: 'ed-item__ico' });
      const txt = h('span', { class: 'ed-item__resumo' });
      // Atualiza o resumo no lugar, enquanto se digita: redesenhar o
      // cartão tiraria o cursor do campo.
      const resumir = () => {
        const t = resumo(item, i);
        txt.textContent = t || nome + ' sem título';
        txt.classList.toggle('ed-item__resumo--vazio', !t);
        if (ico) ico.innerHTML = svgDe(comIcone.escolhido(item, i));
      };
      resumir();
      const cab = h('button', { type: 'button', class: 'ed-item__cab', 'aria-expanded': String(aberto === i) },
        h('span', { class: 'ed-item__n' }, String(i + 1).padStart(2, '0')),
        ico, txt,
        h('span', { class: 'ed-item__seta', 'aria-hidden': 'true' }));
      cab.addEventListener('click', () => { aberto = aberto === i ? -1 : i; pintar(); });

      const acoes = h('div', { class: 'ed-item__acoes' },
        h('button', { type: 'button', class: 'ed-icobtn', title: 'Subir', disabled: i === 0, onclick: () => mover(i, -1), html: '&uarr;' }),
        h('button', { type: 'button', class: 'ed-icobtn', title: 'Descer', disabled: i === lista.length - 1, onclick: () => mover(i, 1), html: '&darr;' }),
        h('button', { type: 'button', class: 'ed-icobtn ed-icobtn--perigo', title: 'Remover', onclick: () => remover(i), html: '&times;' }));

      const card = h('div', { class: 'ed-item' + (aberto === i ? ' ed-item--aberto' : '') },
        h('div', { class: 'ed-item__topo' }, cab, acoes));
      if (aberto === i) {
        const corpo = h('div', { class: 'ed-item__corpo' }, montar(item, i, resumir));
        if (comIcone) corpo.append(seletorIcone(item, comIcone.padrao(i), resumir));
        card.append(corpo);
      }
      raiz.append(card);
    });
    if (!max || lista.length < max) {
      raiz.append(h('button', { type: 'button', class: 'ed-adicionar', onclick: () => { lista.push(novo()); aberto = lista.length - 1; ctx.mudou(); pintar(); } }, '+ Adicionar ' + nome.toLowerCase()));
    }
  }
  function mover(i, d) {
    const j = i + d; if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    aberto = aberto === i ? j : aberto; ctx.mudou(); pintar();
  }
  function remover(i) {
    const item = lista[i];
    const t = resumo(item, i);
    if (!confirm('Remover ' + (t ? '"' + t + '"' : 'este item') + '?')) return;
    lista.splice(i, 1); aberto = -1; ctx.mudou(); pintar();
  }
  pintar();
  return raiz;
}

/* ---------- ícones ---------- */
export function svgDe(nome) {
  return ctx.icones.find((i) => i.nome === nome)?.svg || '';
}

// O que o renderizador escolheria sozinho: pista no título, senão o
// padrão da posição. Igual a iconePara() no servidor.
export function iconeAutomatico(item, padrao) {
  const t = String(item?.titulo || item?.marca || '');
  for (const [re, nome] of ctx.pistas) if (re.test(t)) return nome;
  return padrao;
}
export const iconeEscolhido = (item, padrao) =>
  (item?.icone && ctx.icones.some((i) => i.nome === item.icone)) ? item.icone : iconeAutomatico(item, padrao);

export function seletorIcone(item, padrao, aoTrocar) {
  const grade = h('div', { class: 'ed-icones', role: 'radiogroup', 'aria-label': 'Ícone' });
  function pintar() {
    grade.innerHTML = '';
    const auto = iconeAutomatico(item, padrao);
    const opcao = (nome, rotulo, svg, marcado) => {
      const b = h('button', { type: 'button', class: 'ed-icone', role: 'radio', 'aria-checked': String(marcado), title: rotulo },
        h('span', { class: 'ed-icone__svg', html: svg }),
        h('span', { class: 'ed-icone__rot' }, rotulo));
      b.addEventListener('click', () => {
        if (nome) item.icone = nome; else delete item.icone;
        ctx.mudou(); pintar(); aoTrocar?.();
      });
      return b;
    };
    grade.append(opcao('', 'Automático', svgDe(auto), !item.icone));
    for (const i of ctx.icones) grade.append(opcao(i.nome, i.rotulo, i.svg, item.icone === i.nome));
  }
  pintar();
  return h('div', { class: 'ed-campo' },
    h('span', { class: 'ed-campo__rot' }, 'Ícone'),
    grade,
    h('small', { class: 'ed-campo__dica' }, 'Automático escolhe pelo título. Clique num desenho para fixar.'));
}

/* ---------- imagem ---------- */
export function campoImagem(obj, chave, rotulo, dica) {
  const img = h('img', { alt: '' });
  const pintar = () => { if (obj[chave]) img.src = obj[chave]; else img.removeAttribute('src'); };
  pintar();
  return h('div', { class: 'ed-campo ed-imagem' },
    h('span', { class: 'ed-campo__rot' }, rotulo),
    h('div', { class: 'ed-imagem__in' },
      img,
      h('div', {},
        h('button', { type: 'button', class: 'mini', onclick: async () => { const url = await ctx.escolherImagem(); if (url) { obj[chave] = url; pintar(); ctx.mudou(); } } }, 'Trocar imagem'),
        dica && h('small', { class: 'ed-campo__dica' }, dica))));
}

/* ---------- opções em botões ---------- */
export function opcoes(rotulo, valores, ler, escrever, formatar = String) {
  const grupo = h('div', { class: 'ed-opcoes' });
  function pintar() {
    grupo.innerHTML = '';
    for (const v of valores) {
      grupo.append(h('button', { type: 'button', 'aria-pressed': String(ler() === v), onclick: () => { escrever(v); ctx.mudou(); pintar(); } }, formatar(v)));
    }
  }
  pintar();
  return h('div', { class: 'ed-campo' }, h('span', { class: 'ed-campo__rot' }, rotulo), grupo);
}
