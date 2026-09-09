/* Serve as imagens que o painel subiu.

   As que estão no repositório (img/…) continuam sendo servidas como
   arquivo estático — esta Function só é chamada quando não existe
   arquivo com aquele caminho. Por isso o painel nunca sobrescreve o
   que está versionado no git. */

export async function onRequest({ params, env, next }) {
  if (!env.MIDIA) return next();

  const chave = Array.isArray(params.caminho) ? params.caminho.join('/') : String(params.caminho || '');
  const obj = await env.MIDIA.get(chave);
  if (!obj) return next();

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
}
