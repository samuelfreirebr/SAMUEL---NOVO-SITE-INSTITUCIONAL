import { liberado, pedirSenha } from '../_seguranca.js';

/* A API inteira exige a mesma chave do painel — leitura inclusive.
   Antes só a gravação era checada, e a lista de imagens ficava
   visível para quem descobrisse o endereço. */
export async function onRequest({ request, env, next }) {
  if (!liberado(request, env)) return pedirSenha(env);
  return next();
}
