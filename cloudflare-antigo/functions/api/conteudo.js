import { json } from './_auth.js';

/* GET  devolve o que está salvo (o painel usa para preencher os campos)
   PUT  grava o JSON inteiro                                          */

export async function onRequestGet({ env }) {
  if (!env.CONTEUDO) return json({ erro: 'KV CONTEUDO não está ligado a este projeto.' }, 500);
  const bruto = await env.CONTEUDO.get('site');
  return json(bruto ? JSON.parse(bruto) : {});
}

export async function onRequestPut({ request, env }) {
  if (!env.CONTEUDO) return json({ erro: 'KV CONTEUDO não está ligado a este projeto.' }, 500);

  let dado;
  try {
    dado = await request.json();
  } catch (e) {
    return json({ erro: 'JSON inválido.' }, 400);
  }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) {
    return json({ erro: 'O conteúdo precisa ser um objeto.' }, 400);
  }

  // Guarda a versão anterior: um salvamento ruim não apaga o trabalho.
  const anterior = await env.CONTEUDO.get('site');
  if (anterior) await env.CONTEUDO.put('site:anterior', anterior);

  await env.CONTEUDO.put('site', JSON.stringify(dado));
  return json({ ok: true, salvoEm: new Date().toISOString() });
}
