import { liberado, pedirSenha } from '../_seguranca.js';

export { liberado, pedirSenha };

export const json = (dado, status = 200) => new Response(
  JSON.stringify(dado),
  { status, headers: { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
