/* ============================================================
   Injeta o conteúdo do painel no HTML, no servidor.

   Substitui o HTMLRewriter da Cloudflare, que não existe fora
   dela. Não é um parser de HTML de propósito geral: varre só as
   três marcações que nós mesmos colocamos no markup —
   data-edit, data-edit-img e data-lista — e ignora o resto.

   Regra de ouro, igual à de antes: o HTML do repositório é o
   padrão. O arquivo de dados guarda só o que foi editado. Dado
   vazio, chave inexistente ou JSON quebrado — o texto original
   permanece e nada quebra.
   ============================================================ */

import { LISTAS } from './listas.js';

// Tags que não têm fechamento: nelas só faz sentido trocar atributo.
const VAZIAS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr',
  'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Uma tag de abertura qualquer. O miolo aceita aspas para que um
// ">" dentro de um atributo não corte a tag no lugar errado.
const TAG = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

const pegarAttr = (attrs, nome) => {
  const m = attrs.match(new RegExp('\\b' + nome + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : null;
};

const aspas = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/* Caminho aninhado: "br.sobre.p1" */
function buscar(obj, caminho) {
  return caminho.split('.').reduce(
    (o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/* Onde termina o conteúdo desta tag: procura o fechamento dela
   contando as aberturas do mesmo nome que aparecerem no caminho,
   senão um <div> aninhado fecharia o de fora. */
function acharFechamento(html, desde, nome) {
  const busca = new RegExp('<(/)?' + nome + '(?=[\\s/>])', 'gi');
  busca.lastIndex = desde;
  let nivel = 1;
  let m;
  while ((m = busca.exec(html))) {
    nivel += m[1] ? -1 : 1;
    if (nivel === 0) return m.index;
  }
  return -1;   // markup torto: melhor não mexer
}

export function injetar(html, conteudo) {
  if (!conteudo || typeof conteudo !== 'object') return html;

  let saida = '';
  let cursor = 0;
  let m;
  TAG.lastIndex = 0;

  while ((m = TAG.exec(html))) {
    const nome = m[1].toLowerCase();
    const attrs = m[2];
    if (!attrs.includes('data-edit') && !attrs.includes('data-lista')) continue;

    const fimTag = m.index + m[0].length;

    /* ---- imagem: troca o src, a tag não tem miolo ---- */
    const chaveImg = pegarAttr(attrs, 'data-edit-img');
    if (chaveImg !== null) {
      const valor = buscar(conteudo, chaveImg);
      if (typeof valor === 'string' && valor.trim() !== '') {
        const novos = attrs.match(/\bsrc\s*=\s*"[^"]*"/)
          ? attrs.replace(/\bsrc\s*=\s*"[^"]*"/, `src="${aspas(valor)}"`)
          : attrs + ` src="${aspas(valor)}"`;
        saida += html.slice(cursor, m.index) + '<' + m[1] + novos + '>';
        cursor = fimTag;
      }
      continue;
    }

    /* ---- texto e listas: trocam o miolo ---- */
    let novo = null;

    const chaveTexto = pegarAttr(attrs, 'data-edit');
    if (chaveTexto !== null) {
      const valor = buscar(conteudo, chaveTexto);
      // O painel grava HTML (o contenteditable produz <br>), então
      // entra cru — é conteúdo autenticado, escrito pelo dono.
      if (typeof valor === 'string' && valor.trim() !== '') novo = valor;
    }

    const nomeLista = pegarAttr(attrs, 'data-lista');
    if (novo === null && nomeLista !== null) {
      const itens = conteudo[nomeLista];
      const gerar = LISTAS[nomeLista];
      if (gerar && Array.isArray(itens) && itens.length) novo = gerar(itens);
    }

    if (novo === null || VAZIAS.has(nome)) continue;

    const fecha = acharFechamento(html, fimTag, m[1]);
    if (fecha < 0) continue;

    saida += html.slice(cursor, fimTag) + novo;
    cursor = fecha;
    // Pula o miolo trocado: um data-edit aninhado seria sobrescrito
    // de qualquer jeito, e reprocessá-lo só geraria confusão.
    TAG.lastIndex = fecha;
  }

  return saida + html.slice(cursor);
}
