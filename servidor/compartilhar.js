/* ============================================================
   Preview do link no WhatsApp, Instagram, LinkedIn e iMessage.

   Eles não abrem a página: leem as tags og: do <head> e montam o
   cartão (imagem grande, título, descrição). Sem as tags, o link sai
   pelado. Este módulo monta o bloco certo para cada página, em um
   lugar só, para as páginas do servidor (proposta, briefing, fatura)
   não repetirem cada tag.

   As imagens vêm de site/img/og-*.png e são geradas por
   material/og/gerar.sh. Mudou uma imagem? Suba IMAGEM_V: o WhatsApp
   guarda o preview e só busca de novo quando o endereço muda.
   ============================================================ */

const BASE = (process.env.URL_PUBLICA || 'https://links.samuelfreire.com.br').replace(/\/$/, '');
const IMAGEM_V = '1';

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// `imagem` é o nome sem extensão: site, global, proposta, briefing ou fatura.
export function metaCompartilhar({ titulo, descricao, imagem = 'site', caminho = '/', alt }) {
  const url = BASE + caminho;
  const img = `${BASE}/img/og-${imagem}.png?v=${IMAGEM_V}`;
  const legenda = alt || titulo;
  return `<meta name="description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Samuel Freire">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(legenda)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="#FFFFFF">`;
}
