/* ============================================================
   O servidor do site.

   Faz o que a Cloudflare fazia — servir os arquivos, injetar o
   conteúdo editado, trancar o painel, guardar imagens — sem
   depender dela. Zero dependências: só o Node.

   Rotas:
     /                    site BR      (HTML do repositório + conteúdo salvo)
     /global              site global
     /propostas/<id>      proposta gerada pelo painel
     /admin               painel            · exige senha
     /api/...             API do painel     · exige senha
     /img/...             imagens: repositório primeiro, volume depois
     /estado              diagnóstico, sem revelar valor nenhum
   ============================================================ */

import http from 'node:http';
import path from 'node:path';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { injetar } from './injetar.js';
import { liberado, pedirSenha, temSenhaConfigurada } from './seguranca.js';
import { lerCorpo, lerMultipart } from './multipart.js';
import { renderizarProposta } from './proposta-html.js';
import * as dados from './dados.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
// No container os arquivos são copiados para /app/site — fora dele,
// rodando direto do repositório, a raiz é a pasta acima desta.
const SITE = process.env.PASTA_SITE
  || (existsSync(path.join(AQUI, '..', 'site')) ? path.join(AQUI, '..', 'site') : path.join(AQUI, '..'));
const PORTA = Number(process.env.PORTA || 3000);

const LIMITE_IMAGEM = 6 * 1024 * 1024;        // 6 MB
const LIMITE_JSON = 2 * 1024 * 1024;          // textos do site inteiro cabem folgado
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------- respostas curtas ---------- */

const json = (res, dado, status = 200) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(dado));
};

const texto = (res, msg, status = 200, extra = {}) => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(msg);
};

/* ---------- arquivos ---------- */

/* O que pode ser servido, por primeiro trecho do caminho.

   Lista de permissão, não de bloqueio: rodando direto do
   repositório a raiz contém .git, functions/ e os arquivos de
   trabalho, e negar caso a caso é como se publica um .git sem
   perceber. O que não está aqui não existe para o mundo. */
const PUBLICAS = new Set([
  '', 'index.html', 'global', 'styles', 'js', 'fonts', 'img', 'video',
  'favicon.ico', 'favicon.png', 'robots.txt', 'sitemap.xml',
]);

const permitido = (caminho) => {
  const partes = caminho.split('/').filter(Boolean);
  // Nada de .git, .env, .DS_Store — em nenhum nível.
  if (partes.some((t) => t.startsWith('.'))) return false;
  return PUBLICAS.has(partes[0] || '');
};

// Impede que "..%2f.." saia da pasta do site.
function resolverSeguro(raiz, pedido) {
  const limpo = path.normalize(decodeURIComponent(pedido)).replace(/^(\.\.[/\\])+/, '');
  const destino = path.join(raiz, limpo);
  const rel = path.relative(raiz, destino);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return destino;
}

async function acharArquivo(caminho) {
  const alvo = resolverSeguro(SITE, caminho);
  if (!alvo) return null;
  // try_files: o arquivo, depois a pasta com index.html dentro.
  for (const tentativa of [alvo, path.join(alvo, 'index.html')]) {
    const st = await fs.stat(tentativa).catch(() => null);
    if (st?.isFile()) return tentativa;
  }
  return null;
}

function cabecalhosDe(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  const h = { 'content-type': MIME[ext] || 'application/octet-stream' };
  // O HTML aponta para a versão dos assets (?v=) e muda quando o
  // painel salva: nunca pode ficar em cache. O resto muda de URL
  // a cada alteração, então pode ficar para sempre.
  h['cache-control'] = ext === '.html'
    ? 'no-cache, must-revalidate'
    : 'public, max-age=31536000, immutable';
  return h;
}

async function servirArquivo(res, arquivo, ehHtml) {
  const h = cabecalhosDe(arquivo);
  if (!ehHtml) {
    const st = await fs.stat(arquivo);
    h['content-length'] = st.size;
    res.writeHead(200, h);
    createReadStream(arquivo).pipe(res);
    return;
  }
  const html = await fs.readFile(arquivo, 'utf8');
  const corpo = injetar(html, await dados.lerConteudo());
  h['content-length'] = Buffer.byteLength(corpo);
  res.writeHead(200, h);
  res.end(corpo);
}

/* ---------- API ---------- */

async function api(req, res, url) {
  const rota = url.pathname.replace(/^\/api\/?/, '');

  /* --- textos e imagens do site --- */
  if (rota === 'conteudo') {
    if (req.method === 'GET') return json(res, await dados.lerConteudo());
    if (req.method === 'PUT') {
      let corpo;
      try { corpo = await lerCorpo(req, LIMITE_JSON); }
      catch (e) { return json(res, { erro: 'Conteúdo grande demais.' }, 413); }
      let dado;
      try { dado = JSON.parse(corpo.toString('utf8')); }
      catch (e) { return json(res, { erro: 'JSON inválido.' }, 400); }
      if (!dado || typeof dado !== 'object' || Array.isArray(dado)) {
        return json(res, { erro: 'O conteúdo precisa ser um objeto.' }, 400);
      }
      return json(res, await dados.gravarConteudo(dado));
    }
    return json(res, { erro: 'Método não aceito.' }, 405);
  }

  /* --- biblioteca de imagens --- */
  if (rota === 'imagens') {
    if (req.method === 'GET') return json(res, { imagens: await dados.listarImagens() });

    if (req.method === 'POST') {
      let corpo;
      try { corpo = await lerCorpo(req, LIMITE_IMAGEM + 65536); }
      catch (e) { return json(res, { erro: 'Imagem acima do limite de 6 MB.' }, 413); }

      const form = lerMultipart(corpo, req.headers['content-type']);
      const arq = form?.arquivos?.arquivo;
      const pasta = form?.campos?.pasta || 'geral';

      if (!arq) return json(res, { erro: 'Nenhum arquivo recebido.' }, 400);
      if (!TIPOS_IMAGEM.includes(arq.tipo)) {
        return json(res, { erro: `Formato ${arq.tipo || 'desconhecido'} não aceito. Use JPG, PNG, WebP ou AVIF.` }, 400);
      }
      if (arq.bytes.length > LIMITE_IMAGEM) {
        return json(res, { erro: `Imagem de ${(arq.bytes.length / 1048576).toFixed(1)} MB. O limite é 6 MB.` }, 400);
      }
      try {
        const salva = await dados.gravarImagem(pasta, arq.nome, arq.bytes);
        return json(res, { ok: true, ...salva });
      } catch (e) { return json(res, { erro: e.message }, 400); }
    }

    if (req.method === 'DELETE') {
      const chave = url.searchParams.get('chave');
      if (!chave) return json(res, { erro: 'Informe a chave da imagem.' }, 400);
      const foi = await dados.apagarImagem(chave);
      return foi ? json(res, { ok: true }) : json(res, { erro: 'Imagem não encontrada.' }, 404);
    }
    return json(res, { erro: 'Método não aceito.' }, 405);
  }

  /* --- propostas --- */
  if (rota === 'propostas') {
    if (req.method === 'GET') return json(res, { propostas: await dados.listarPropostas() });
    if (req.method === 'POST' || req.method === 'PUT') {
      let corpo;
      try { corpo = await lerCorpo(req, LIMITE_JSON); }
      catch (e) { return json(res, { erro: 'Proposta grande demais.' }, 413); }
      let p;
      try { p = JSON.parse(corpo.toString('utf8')); }
      catch (e) { return json(res, { erro: 'JSON inválido.' }, 400); }
      try {
        const salva = await dados.gravarProposta(p);
        return json(res, { ok: true, id: salva.id, url: '/propostas/' + salva.id, proposta: salva });
      } catch (e) { return json(res, { erro: e.message }, 400); }
    }
    return json(res, { erro: 'Método não aceito.' }, 405);
  }

  if (rota.startsWith('propostas/')) {
    const id = rota.slice('propostas/'.length);
    if (req.method === 'GET') {
      const p = await dados.lerProposta(id);
      return p ? json(res, p) : json(res, { erro: 'Proposta não encontrada.' }, 404);
    }
    if (req.method === 'DELETE') {
      const foi = await dados.apagarProposta(id);
      return foi ? json(res, { ok: true }) : json(res, { erro: 'Proposta não encontrada.' }, 404);
    }
    return json(res, { erro: 'Método não aceito.' }, 405);
  }

  return json(res, { erro: 'Rota não existe.' }, 404);
}

/* ---------- diagnóstico ---------- */

async function estado(res) {
  const ver = async (p) => Boolean(await fs.stat(p).catch(() => null));
  const conteudo = await dados.lerConteudo();
  json(res, {
    servidor: 'node',
    senhaConfigurada: temSenhaConfigurada(),
    pastaDados: dados.RAIZ_DADOS,
    dadosGravaveis: await podeGravar(),
    conteudoSalvo: Object.keys(conteudo).length > 0,
    propostas: (await dados.listarPropostas()).length,
    siteBr: await ver(path.join(SITE, 'index.html')),
    siteGlobal: await ver(path.join(SITE, 'global', 'index.html')),
    painel: await ver(path.join(SITE, 'admin', 'index.html')),
    pronto: temSenhaConfigurada() && await podeGravar(),
  });
}

async function podeGravar() {
  try {
    await dados.preparar();
    const t = path.join(dados.RAIZ_DADOS, '.escrita-teste');
    await fs.writeFile(t, 'ok');
    await fs.unlink(t);
    return true;
  } catch (e) { return false; }
}

/* ---------- roteador ---------- */

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    let caminho = url.pathname;

    if (caminho === '/estado') return estado(res);

    /* Painel e API: trancados juntos, leitura inclusive. */
    if (caminho === '/admin' || caminho.startsWith('/admin/') || caminho.startsWith('/api/')) {
      if (!liberado(req)) return pedirSenha(res);

      if (caminho.startsWith('/api/')) return api(req, res, url);

      /* /admin precisa da barra final. Sem ela o navegador resolve
         o import de './editor.js' como /editor.js e o painel abre
         morto — foi exatamente o que aconteceu. É o mesmo
         redirecionamento de diretório que qualquer servidor faz. */
      if (caminho === '/admin') {
        res.writeHead(308, { location: '/admin/' + url.search, 'cache-control': 'no-store' });
        return res.end();
      }

      const arq = await acharArquivo(caminho);
      if (!arq) return texto(res, 'Não encontrado.', 404);
      const st = await fs.stat(arq);
      res.writeHead(200, {
        'content-type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      });
      return createReadStream(arq).pipe(res);
    }

    /* Propostas: página pública, gerada do JSON. */
    if (caminho.startsWith('/propostas/')) {
      const id = caminho.slice('/propostas/'.length).replace(/\/$/, '');
      const p = await dados.lerProposta(id);
      if (!p) return texto(res, 'Proposta não encontrada.', 404);
      if (p.publicada === false && !liberado(req)) return texto(res, 'Proposta não encontrada.', 404);
      const html = renderizarProposta(p);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-cache, must-revalidate',
        'x-robots-tag': 'noindex, nofollow',
      });
      return res.end(html);
    }

    /* Imagens: o repositório vence, o volume completa. Assim o
       painel nunca sobrescreve o que está versionado no git. */
    if (caminho.startsWith('/img/')) {
      if (!permitido(caminho)) return texto(res, 'Imagem não encontrada.', 404);
      const doRepo = await acharArquivo(caminho);
      if (doRepo) return servirArquivo(res, doRepo, false);

      const doVolume = resolverSeguro(dados.PASTA_IMAGENS, caminho.slice('/img/'.length));
      const st = doVolume && await fs.stat(doVolume).catch(() => null);
      if (st?.isFile()) {
        res.writeHead(200, {
          'content-type': MIME[path.extname(doVolume).toLowerCase()] || 'application/octet-stream',
          'content-length': st.size,
          'cache-control': 'public, max-age=31536000, immutable',
        });
        return createReadStream(doVolume).pipe(res);
      }
      return texto(res, 'Imagem não encontrada.', 404);
    }

    /* Desvio por país. Só funciona atrás da Cloudflare em modo
       proxy, que é quem manda o CF-IPCountry. Sem o cabeçalho,
       nada acontece — e ninguém fica preso na versão errada. */
    if (caminho === '/' && process.env.ROTEAR_POR_PAIS !== '0') {
      const pais = req.headers['cf-ipcountry'];
      if (pais && pais !== 'BR' && pais !== 'XX' && pais !== 'T1') caminho = '/global/';
    }

    if (!permitido(caminho)) return texto(res, 'Página não encontrada.', 404);

    const arq = await acharArquivo(caminho);
    if (!arq) return texto(res, 'Página não encontrada.', 404);
    return servirArquivo(res, arq, path.extname(arq).toLowerCase() === '.html');

  } catch (e) {
    console.error('erro na requisição:', e);
    if (!res.headersSent) texto(res, 'Erro interno.', 500);
    else res.end();
  }
});

await dados.preparar().catch((e) => console.error('não consegui preparar a pasta de dados:', e.message));
const plantadas = await dados.semear().catch(() => []);
if (plantadas.length) console.log('propostas instaladas:', plantadas.join(', '));

servidor.listen(PORTA, () => {
  console.log(`site em http://localhost:${PORTA}`);
  console.log(`arquivos:  ${SITE}`);
  console.log(`dados:     ${dados.RAIZ_DADOS}`);
  if (!temSenhaConfigurada()) {
    console.warn('ATENÇÃO: SENHA_PAINEL não definida — /admin e /api estão trancados para todos.');
  }
});
