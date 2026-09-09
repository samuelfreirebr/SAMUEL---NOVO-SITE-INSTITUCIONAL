/* ============================================================
   Injeta o conteúdo do painel no HTML, no servidor.

   Por que aqui e não no navegador: se o texto fosse buscado por
   JavaScript, a página chegaria vazia ao Google e a quem tem JS
   desligado. Aqui ela chega pronta.

   Regra de ouro: o HTML do repositório é o padrão. O KV guarda só
   o que foi editado. KV vazio, Function fora do ar ou chave que
   não existe — o texto original permanece e nada quebra.
   ============================================================ */

const escapar = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- geradores das listas ---------- */

function htmlClientes(itens) {
  return itens.map((c) => {
    const ini = escapar(c.inicial || (c.nome || '?').slice(0, 2).toUpperCase());
    const foto = c.foto
      ? `<img src="${escapar(c.foto)}" alt="" width="160" height="160" loading="lazy">`
      : '';
    const arroba = c.handle ? `<em>${escapar(c.handle)}</em>` : '';
    return `<li class="cliente">`
      + `<span class="cliente__foto" data-inicial="${ini}">${foto}</span>`
      + `<span class="cliente__txt"><b>${escapar(c.nome)}</b>${arroba}</span>`
      + `</li>`;
  }).join('');
}

function htmlBastidores(itens) {
  return itens.map((f) =>
    `<li><img src="${escapar(f.src || f)}" alt="" width="630" height="803" loading="lazy"></li>`
  ).join('');
}

function htmlProjetos(itens) {
  return itens.map((p, i) => {
    const n = String(i + 1).padStart(2, '0');
    const media = p.imagem
      ? `<figure class="projeto__media"><img src="${escapar(p.imagem)}" alt="" loading="lazy"></figure>`
      : '';
    return `<li class="projeto reveal">`
      + `<a class="projeto__link" href="${escapar(p.link || '#')}"${p.link ? ' target="_blank" rel="noopener"' : ''}>`
      + `<span class="projeto__num" aria-hidden="true">${n}</span>`
      + `<div class="projeto__corpo">`
      + `<p class="projeto__tags"><span class="tag">${escapar(p.tag || '')}</span>`
      + `<span class="projeto__data">${escapar(p.data || '')}</span></p>`
      + `<h3 class="h3 projeto__titulo">${escapar(p.titulo || '')}</h3>`
      + `<p class="body projeto__ctx">${escapar(p.contexto || '')}</p>`
      + `<p class="small projeto__disc">${escapar(p.disciplinas || '')}</p>`
      + `</div>`
      + media
      + `<span class="projeto__seta" aria-hidden="true">`
      + `<svg width="15" height="15"><use href="#i-arrow"/></svg></span>`
      + `</a></li>`;
  }).join('');
}

const LISTAS = {
  clientes: htmlClientes,
  bastidores: htmlBastidores,
  projetos: htmlProjetos,
};

/* ---------- caminho aninhado: "br.sobre.p1" ---------- */
function buscar(obj, caminho) {
  return caminho.split('.').reduce(
    (o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const resposta = await next();

  const tipo = resposta.headers.get('content-type') || '';
  if (!tipo.includes('text/html')) return resposta;

  let conteudo = null;
  try {
    if (env.CONTEUDO) {
      const bruto = await env.CONTEUDO.get('site');
      if (bruto) conteudo = JSON.parse(bruto);
    }
  } catch (e) {
    // KV indisponível ou JSON inválido: segue com o HTML do repositório
    return resposta;
  }
  if (!conteudo) return resposta;

  const nova = new HTMLRewriter()
    .on('[data-edit]', {
      element(el) {
        const valor = buscar(conteudo, el.getAttribute('data-edit'));
        if (typeof valor === 'string' && valor.trim() !== '') {
          el.setInnerContent(valor, { html: true });
        }
      },
    })
    .on('[data-lista]', {
      element(el) {
        const nome = el.getAttribute('data-lista');
        const itens = conteudo[nome];
        const gerar = LISTAS[nome];
        if (gerar && Array.isArray(itens) && itens.length) {
          el.setInnerContent(gerar(itens), { html: true });
        }
      },
    })
    .transform(resposta);

  // O HTML muda quando o painel salva: não pode ficar em cache.
  nova.headers.set('Cache-Control', 'no-cache, must-revalidate');
  return nova;
}
