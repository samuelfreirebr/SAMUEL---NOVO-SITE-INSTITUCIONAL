import { liberado, pedirSenha } from '../_seguranca.js';

/* Tranca tudo sob /admin — inclusive a própria tela do painel, que
   antes era servida como arquivo estático para qualquer um. */
export async function onRequest({ request, env, next }) {
  if (!liberado(request, env)) return pedirSenha(env);

  const r = await next();
  const nova = new Response(r.body, r);
  nova.headers.set('Cache-Control', 'no-store');
  nova.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return nova;
}
