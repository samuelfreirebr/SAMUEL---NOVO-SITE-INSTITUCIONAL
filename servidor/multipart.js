/* ============================================================
   Lê um formulário multipart/form-data.

   O envio de imagem do painel manda um arquivo e um campo de
   texto. Node não traz leitor de multipart, e não vale puxar
   dependência para trinta linhas de trabalho — o site inteiro
   foi feito sem npm, o servidor segue a mesma regra.
   ============================================================ */

export async function lerCorpo(req, limite) {
  const pedacos = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) {
      const e = new Error('Arquivo grande demais.');
      e.grande = true;
      throw e;
    }
    pedacos.push(p);
  }
  return Buffer.concat(pedacos);
}

export function lerMultipart(corpo, tipoConteudo) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipoConteudo || '');
  if (!m) return null;

  const marca = Buffer.from('--' + (m[1] || m[2]).trim());
  const campos = {};
  const arquivos = {};

  let pos = corpo.indexOf(marca);
  while (pos >= 0) {
    const ini = pos + marca.length;
    if (corpo.slice(ini, ini + 2).toString() === '--') break;      // fim do formulário

    const prox = corpo.indexOf(marca, ini);
    if (prox < 0) break;

    // Uma parte é: cabeçalhos, linha em branco, conteúdo, CRLF final.
    const parte = corpo.slice(ini + 2, prox - 2);
    const corte = parte.indexOf('\r\n\r\n');
    if (corte < 0) { pos = prox; continue; }

    const cab = parte.slice(0, corte).toString('utf8');
    const dado = parte.slice(corte + 4);

    const nome = /name="([^"]*)"/i.exec(cab)?.[1];
    const arquivo = /filename="([^"]*)"/i.exec(cab)?.[1];
    const tipo = /content-type:\s*([^\r\n;]+)/i.exec(cab)?.[1]?.trim();

    if (nome) {
      if (arquivo !== undefined) arquivos[nome] = { nome: arquivo, tipo, bytes: dado };
      else campos[nome] = dado.toString('utf8');
    }
    pos = prox;
  }

  return { campos, arquivos };
}
