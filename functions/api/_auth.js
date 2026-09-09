/* O Cloudflare Access barra a requisição antes de ela chegar aqui.
   Esta checagem é a segunda tranca: se alguém publicar sem configurar a
   política de Access, a API recusa em vez de ficar aberta ao mundo. */
export function autorizado(request) {
  return Boolean(request.headers.get('Cf-Access-Jwt-Assertion'));
}

export function recusar() {
  return new Response(
    JSON.stringify({ erro: 'Sem autorização. Configure o Cloudflare Access em /admin e /api.' }),
    { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export const json = (dado, status = 200) => new Response(
  JSON.stringify(dado), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
