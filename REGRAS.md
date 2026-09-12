# Regras do projeto

Valem para toda atualização ou construção nova neste repositório: site,
painel, propostas, prospecção, servidor e documentos. Quem for mexer (pessoa
ou IA) lê isto antes de começar.

## 1. Escrita

1. **Sem travessão em lugar nenhum.** Nem `—` (travessão) nem `–` (meia-risca),
   nem a entidade `&mdash;` / `&ndash;`. Vale para texto da página, painel,
   mensagens de erro, textos padrão do modelo, comentários no código, mensagens
   de commit e documentos. No lugar, use vírgula, dois-pontos, ponto ou
   parênteses. Para intervalo, escreva "de 3 a 5" ou use hífen simples ("3-5").
   Este arquivo é a única exceção, porque precisa mostrar os caracteres.
   Antes de terminar, confira:
   ```bash
   grep -rln "[—–]\|&mdash;\|&ndash;" site servidor
   ```
2. Português do Brasil, com acento. Nada de "Rotulo", "Botao", "orcamento"
   sem acento na interface.
3. Nomes no código também em português, como o resto do projeto
   (`renderizarProposta`, `talvez`, `ligada`).
4. Texto de interface curto e direto: diz o que acontece, sem jargão técnico.
   Toda opção que some da página ao ser desligada explica o que some.

## 2. Visual

1. Toda cor, medida, fonte e tempo sai de `site/styles/tokens.css` (`var(...)`).
   Nada de cor crua nos CSS da página pública.
2. Um raio só (`--radius-img`), separação por hairline, sem sombra e sem
   gradiente na página pública. O laranja (`--brand`) é detalhe, não fundo de
   tudo.
3. Responsivo de verdade. Conferir em 375 (celular), 620 (tablet), 1280x720,
   1440x900 e 1920x1080:
   - nada passa da borda direita;
   - título nunca quebra palavra no meio;
   - no computador, cada seção cabe na tela sempre que der.
4. A página funciona sem JavaScript: sem o `main.js`, tudo nasce visível.
   Movimento respeita `prefers-reduced-motion`.

## 3. Propostas

1. Seção nova de proposta leva as cinco partes juntas:
   - renderizador em `servidor/proposta-html.js`, protegido por `talvez()`;
   - estilo em `site/styles/proposta.css`;
   - etapa com os campos em `site/admin/propostas/passos.js`;
   - texto padrão em `servidor/sementes/modelo-proposta.json`;
   - se puder ser desligada, entrada em `PARTES` (renderizador) e chave no editor.
2. Toda seção e subparte que faz sentido esconder ganha botão de ligar e
   desligar (`p.visivel`). Desligar esconde, nunca apaga o texto.
3. Proposta antiga continua abrindo igual: campo novo ausente vale o
   comportamento de antes (ligado, ou o texto do modelo).
4. Mudou `proposta.css` ou `site/js/proposta.js`? Suba a versão `V` no topo de
   `servidor/proposta-html.js`, senão o navegador do cliente usa a antiga.
5. O editor mostra a prévia pelo mesmo renderizador da página pública. Nunca
   montar uma segunda versão da página só para o painel.

## 4. Servidor e segurança

1. Node puro, sem dependência: não há `npm install` nem build. Não adicionar
   pacote.
2. Toda rota de dados passa pela tranca do painel (`liberado`). Só a página
   pública da proposta publicada e o login ficam abertos.
3. Chave de serviço externo (Google, Anthropic, Serper) vem de variável de
   ambiente na stack, nunca escrita no código.
4. Antes de dar por pronto: `node --check` nos arquivos JS alterados e teste
   no navegador do que mudou na tela.

## 5. Publicação e git

1. O deploy segue `material/publicacao.md` (Swarm, Traefik, ghcr.io, Portainer
   pelo Web editor). Variável nova vai para o `docker-stack.yml` e para a stack
   no Portainer.
2. Commits em português, explicando o porquê, sem travessão.
3. O push é feito pelo Samuel no GitHub Desktop: deixar o commit pronto, não
   dar push sem ele pedir.
