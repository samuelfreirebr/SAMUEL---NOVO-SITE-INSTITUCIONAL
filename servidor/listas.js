/* ============================================================
   Geradores das listas dinâmicas (clientes, bastidores, projetos).

   O mesmo HTML que a versão Cloudflare gerava, agora em Node.
   Mantido em arquivo próprio porque o injetor e as propostas
   precisam dos dois lados: o servidor monta, o painel edita.
   ============================================================ */

export const escapar = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function htmlClientes(itens) {
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

export function htmlBastidores(itens) {
  return itens.map((f) =>
    `<li><img src="${escapar(f.src || f)}" alt="" width="630" height="803" loading="lazy"></li>`
  ).join('');
}

export function htmlProjetos(itens) {
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

export const LISTAS = {
  clientes: htmlClientes,
  bastidores: htmlBastidores,
  projetos: htmlProjetos,
};
