/* ============================================================
   Diagnóstico rápido de um site.

   Um fetch cru do HTML — sem navegador — e um punhado de
   heurísticas com peso. A nota é 100 menos a soma dos pesos.
   Não substitui o PageSpeed (que o navegador chama depois,
   porque o Google leva 20–40 s); é o primeiro olhar, o que dá
   pra dizer em dois segundos ao abrir o card.

   Sai daqui:
     { url, titulo, nota, ms, kb, problemas[{chave,peso,texto}],
       bons[], porte, sinaisPequeno[], sinaisGrande[] }

   Sites bloqueiam robô às vezes (403). Aí a chave vira 'fora'
   ou 'erro' — e o PageSpeed, se abrir o site, apaga essas duas.
   ============================================================ */

const TEMPO_MAX = 12000;          // ms para desistir do site
const CORPO_MAX = 2 * 1024 * 1024; // lê no máximo 2 MB do HTML

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function normalizarUrl(bruta) {
  let u = String(bruta || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch (e) { return null; }
}

/* ---------- leitura ---------- */

async function baixar(url) {
  const inicio = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_MAX);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    // Lê até o limite e para: um site que devolve 40 MB de HTML
    // não merece derrubar o servidor.
    const leitor = r.body?.getReader();
    const pedacos = [];
    let total = 0;
    if (leitor) {
      while (total < CORPO_MAX) {
        const { done, value } = await leitor.read();
        if (done) break;
        pedacos.push(value); total += value.length;
      }
      try { await leitor.cancel(); } catch (e) { /* já fechou */ }
    }
    const html = Buffer.concat(pedacos).toString('utf8');
    return { ok: true, status: r.status, urlFinal: r.url || url, html, ms: Date.now() - inicio, bytes: total, tipo: r.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, erro: e.name === 'AbortError' ? 'tempo' : (e.message || 'falha'), ms: Date.now() - inicio };
  } finally { clearTimeout(timer); }
}

/* ---------- heurísticas ---------- */

const CONSTRUTORES = [
  [/wixsite\.com|static\.wixstatic|wix\.com/i, 'Wix'],
  [/godaddysites\.com|secureserver\.net/i, 'GoDaddy'],
  [/site123\.me|site123/i, 'Site123'],
  [/webnode\.(com|page|com\.br)/i, 'Webnode'],
  [/\.wordpress\.com/i, 'WordPress.com gratuito'],
  [/blogspot\.com/i, 'Blogger'],
  [/weebly\.com/i, 'Weebly'],
  [/\.negocio\.site|business\.site/i, 'Google Meu Negócio'],
  [/linktr\.ee|beacons\.ai|bio\.site/i, 'página de links'],
];

const meta = (html, nome) => {
  const re = new RegExp('<meta[^>]+(?:name|property)=["\']' + nome + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:name|property)=["\']' + nome + '["\']', 'i');
  return (html.match(re) || html.match(re2) || [])[1] || '';
};

const limparTexto = (s) => String(s || '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

function analisar(html, urlFinal, ms, bytes) {
  const problemas = [];
  const bons = [];
  const p = (chave, peso, texto) => problemas.push({ chave, peso, texto });

  const kb = Math.round(bytes / 1024);
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const textoMin = texto.toLowerCase();
  const htmlMin = html.toLowerCase();

  /* protocolo */
  if (/^http:/i.test(urlFinal)) p('https', 14, 'Abre sem cadeado (sem HTTPS) — o navegador avisa "não seguro"');
  else bons.push('Tem HTTPS');

  /* velocidade e peso — crus, sem navegador; o PageSpeed refina */
  if (ms > 3000) p('lento', 12, `Demorou ${(ms / 1000).toFixed(1)} s só pra responder`);
  else if (ms > 1500) p('lento', 6, `Levou ${(ms / 1000).toFixed(1)} s pra responder`);
  else bons.push('Responde rápido');
  if (kb > 2500) p('pesado', 10, `Página de ${(kb / 1024).toFixed(1)} MB só de HTML`);
  else if (kb > 1200) p('pesado', 5, `HTML pesado (${kb} KB)`);

  /* celular */
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) p('viewport', 18, 'Não se adapta ao celular (sem viewport)');
  else bons.push('Preparado pra celular');

  /* título e descrição */
  const titulo = limparTexto((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  if (!titulo) p('titulo', 8, 'Sem título na aba do navegador');
  else if (/^(home|início|inicio|untitled|index|página inicial|bem[- ]vindo|welcome|new page|site)\b/i.test(titulo) || titulo.length < 8) p('titulo', 6, `Título genérico na aba: "${titulo.slice(0, 40)}"`);
  const descricao = meta(html, 'description');
  if (!descricao) p('descricao', 6, 'Sem descrição pro Google (meta description)');
  if (!meta(html, 'og:image')) p('og', 4, 'Sem imagem quando o link é compartilhado no WhatsApp');
  else bons.push('Tem imagem de compartilhamento');

  /* estrutura */
  if (!/<h1[\s>]/i.test(html)) p('h1', 6, 'Sem um título principal (h1) dizendo o que faz');

  /* contato */
  const temWhats = /wa\.me|api\.whatsapp\.com|whatsapp:\/\/|whatsapp/i.test(html);
  const temTel = /href=["']tel:/i.test(html);
  const temMail = /href=["']mailto:/i.test(html);
  const temForm = /<form[\s>]/i.test(html);
  const temContatoLink = /(contato|contact|fale conosco|orçamento|orcamento|agende|agendar|book now|get a quote)/i.test(html);
  if (!temWhats && !temTel && !temMail && !temForm && !temContatoLink) p('cta', 14, 'Não tem um botão de contato claro');
  else {
    if (temWhats) bons.push('Tem botão de WhatsApp');
    else if (temTel) bons.push('Tem telefone clicável');
    if (!temWhats && !temTel) p('whats', 6, 'Sem WhatsApp nem telefone clicável — o cliente precisa digitar');
  }

  /* parado no tempo */
  const anoAtual = new Date().getFullYear();
  const anos = [...htmlMin.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/g)].map((m) => Number(m[1]));
  const ano = anos.length ? Math.max(...anos) : null;
  if (ano && ano <= anoAtual - 3) p('velho', 10, `Rodapé parado em ${ano}`);
  if (/<font[\s>]|<center[\s>]|<marquee[\s>]|<frameset[\s>]|<blink[\s>]/i.test(html)) p('antigo', 10, 'Código de site antigo (font, center, marquee)');
  if (/\.swf\b|shockwave-flash/i.test(html)) p('flash', 12, 'Ainda usa Flash — não abre em nenhum celular');
  if (/jquery[-.]1\.\d/i.test(html)) p('jquery', 4, 'Bibliotecas de mais de dez anos atrás');

  /* construtor gratuito */
  const construtor = CONSTRUTORES.find(([re]) => re.test(urlFinal) || re.test(htmlMin));
  if (construtor) p('construtor', 6, `Feito num ${construtor[1]} — layout de modelo pronto`);

  /* “em construção” */
  if (/em construção|em construcao|under construction|coming soon|em breve/i.test(textoMin) && texto.length < 3000) p('construcao', 16, 'Página "em construção" ou quase vazia');
  else if (texto.replace(/\s+/g, ' ').trim().length < 400) p('vazio', 12, 'Quase sem texto — não explica o que faz');

  /* nota */
  const soma = problemas.reduce((s, x) => s + x.peso, 0);
  const nota = Math.max(0, Math.min(100, 100 - soma));

  return { titulo, descricao, nota, kb, problemas, bons, ...porte(html, textoMin) };
}

/* Porte: operação de uma pessoa só, ou tem time? Serve pra escolher
   o tom da abordagem e pra saber se o orçamento existe. */
function porte(html, textoMin) {
  const sinaisPequeno = [];
  const sinaisGrande = [];

  const fones = new Set((html.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g) || []).map((f) => f.replace(/\D/g, '')));
  if (fones.size >= 3) sinaisGrande.push(`${fones.size} telefones diferentes`);
  else if (fones.size === 1) sinaisPequeno.push('Um telefone só');

  const paginas = new Set((html.match(/href=["']\/[a-z0-9\-/]{2,}["']/gi) || []));
  if (paginas.size >= 12) sinaisGrande.push(`${paginas.size} páginas internas`);
  else if (paginas.size <= 3) sinaisPequeno.push('Site de uma página só');

  if (/nossa equipe|nosso time|our team|equipe|profissionais/i.test(textoMin)) sinaisGrande.push('Fala em equipe');
  if (/trabalhe conosco|vagas|careers|join us/i.test(textoMin)) sinaisGrande.push('Tem "trabalhe conosco"');
  if (/unidades|filiais|franquia|nossas lojas|locations/i.test(textoMin)) sinaisGrande.push('Tem mais de uma unidade');
  if (/política de privacidade|privacy policy|termos de uso/i.test(textoMin)) sinaisGrande.push('Tem página de política');
  if (/\b(eu|meu|minha|me chamo|sou o|sou a|i am|my name)\b/i.test(textoMin)) sinaisPequeno.push('Fala em primeira pessoa');
  if (/whatsapp/i.test(textoMin) && !/central|sac|atendimento ao cliente/i.test(textoMin)) sinaisPequeno.push('Atende pelo WhatsApp direto');

  const saldo = sinaisGrande.length - sinaisPequeno.length;
  const porte = saldo >= 2 ? 'grande' : saldo <= -1 ? 'pequeno' : 'medio';
  return { porte, sinaisPequeno, sinaisGrande };
}

/* ---------- entrada ---------- */

export async function diagnosticar(urlBruta) {
  const url = normalizarUrl(urlBruta);
  if (!url) return { erro: 'Endereço inválido.' };

  const r = await baixar(url);
  if (!r.ok) {
    return {
      url, titulo: '', nota: 0, ms: r.ms, kb: 0, bons: [],
      problemas: [{ chave: 'fora', peso: 100, texto: r.erro === 'tempo' ? 'O site não respondeu em 12 segundos' : 'O site não abriu' }],
      porte: 'medio', sinaisPequeno: [], sinaisGrande: [],
    };
  }
  if (r.status >= 400) {
    return {
      url, titulo: '', nota: 0, ms: r.ms, kb: 0, bons: [],
      problemas: [{ chave: 'erro', peso: 100, texto: r.status === 403 || r.status === 429 ? 'O site barrou a leitura automática (pode ser bloqueio de robô, não site fora)' : `O site respondeu com erro ${r.status}` }],
      porte: 'medio', sinaisPequeno: [], sinaisGrande: [],
    };
  }
  if (!/html|xml|text/i.test(r.tipo) && r.html.length < 200) {
    return { url, titulo: '', nota: 20, ms: r.ms, kb: 0, bons: [], problemas: [{ chave: 'erro', peso: 80, texto: 'O endereço não devolve uma página' }], porte: 'medio', sinaisPequeno: [], sinaisGrande: [] };
  }
  return { url: r.urlFinal, ms: r.ms, ...analisar(r.html, r.urlFinal, r.ms, r.bytes) };
}
