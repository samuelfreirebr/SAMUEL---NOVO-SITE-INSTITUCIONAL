import { autorizado, recusar, json } from './_auth.js';

/* GET     lista o que está no R2
   POST    sobe uma imagem (multipart: campo "arquivo", campo "pasta")
   DELETE  apaga uma (?chave=...)                                     */

const PASTAS = ['clientes', 'projetos', 'bastidores', 'geral'];
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const LIMITE = 6 * 1024 * 1024;   // 6 MB

export async function onRequestGet({ env }) {
  if (!env.MIDIA) return json({ erro: 'Bucket R2 MIDIA não está ligado.' }, 500);
  const lista = await env.MIDIA.list({ limit: 500 });
  return json({
    imagens: lista.objects.map((o) => ({
      chave: o.key, url: '/img/' + o.key, tamanho: o.size, em: o.uploaded,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  if (!autorizado(request)) return recusar();
  if (!env.MIDIA) return json({ erro: 'Bucket R2 MIDIA não está ligado.' }, 500);

  const form = await request.formData();
  const arquivo = form.get('arquivo');
  const pasta = String(form.get('pasta') || 'geral');

  if (!arquivo || typeof arquivo === 'string') return json({ erro: 'Nenhum arquivo recebido.' }, 400);
  if (!PASTAS.includes(pasta)) return json({ erro: 'Pasta inválida.' }, 400);
  if (!TIPOS.includes(arquivo.type)) {
    return json({ erro: `Formato ${arquivo.type || 'desconhecido'} não aceito. Use JPG, PNG, WebP ou AVIF.` }, 400);
  }
  if (arquivo.size > LIMITE) {
    return json({ erro: `Imagem de ${(arquivo.size / 1048576).toFixed(1)} MB. O limite é 6 MB.` }, 400);
  }

  // Nome previsível e sem acento, para nunca quebrar a URL.
  const limpo = (arquivo.name || 'imagem')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const chave = `${pasta}/${Date.now().toString(36)}-${limpo}`;

  await env.MIDIA.put(chave, arquivo.stream(), {
    httpMetadata: { contentType: arquivo.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return json({ ok: true, chave, url: '/img/' + chave });
}

export async function onRequestDelete({ request, env }) {
  if (!autorizado(request)) return recusar();
  if (!env.MIDIA) return json({ erro: 'Bucket R2 MIDIA não está ligado.' }, 500);

  const chave = new URL(request.url).searchParams.get('chave');
  if (!chave) return json({ erro: 'Informe a chave da imagem.' }, 400);

  await env.MIDIA.delete(chave);
  return json({ ok: true });
}
