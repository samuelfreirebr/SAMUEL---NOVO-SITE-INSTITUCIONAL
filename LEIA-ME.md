# Samuel Freire — site institucional

HTML + CSS + JavaScript puros. Sem framework, sem build, sem npm.
São arquivos estáticos: sobem em qualquer hospedagem.

## Arquivos

Quatro pastas, cada uma com um papel:

```
site/                  o site como vai ao ar
  index.html             versão BR
  global/index.html      versão internacional
  admin/                 painel de edição
  google-prospection/    prospecção: varredura do Google Maps, diagnóstico, mensagens, leads
  styles/tokens.css      variáveis (cores, fontes, espaços, tempos)
  styles/base.css        reset, tipografia, botões, utilitários
  styles/site.css        cada seção da página
  styles/br.css          o pouco que só a BR tem
  styles/global.css      o pouco que só a global tem
  styles/proposta.css    layout das propostas
  js/main.js             todo o comportamento
  fonts/                 Manrope auto-hospedada (.woff2)
  img/                   retrato, bastidores, clientes, favicon

servidor/              o servidor Node que roda no Portainer (zero dependências)
  servidor.js            rotas, arquivos, tranca
  injetar.js             põe o texto editado no HTML antes de servir
  dados.js               textos, imagens e propostas no volume
  proposta-html.js       monta a página de uma proposta
  prospeccao.js          rotas da prospecção: busca, cidades, IA, Instagram, vagas, leads
  prospeccao-site.js     diagnóstico rápido de um site (fetch cru + heurísticas)
  seguranca.js           senha do painel
  multipart.js           leitura do upload de imagem
  listas.js              clientes, bastidores, projetos
  sementes/              propostas que já vêm no repositório

material/              arquivos de trabalho — não vão ao ar
  publicacao.md                    como os aplicativos do Samuel são publicados
  arquitetura-site.md              site estático, sem painel: como é feito e como vira dist — para colar numa IA
  apresentacao-comercial.dc.html   a apresentação de onde saiu a copy
  perfis-instagram.html            fonte das fotos dos clientes (fora do git)
  originais/                       imagens em tamanho original (fora do git)

cloudflare-antigo/     o painel na versão para Cloudflare Pages
  functions/             KV, R2 e HTMLRewriter — não é usado pelo Docker
  _headers               cache do Pages

Dockerfile             monta a imagem: só site/ e servidor/ entram
docker-stack.yml       a stack do Portainer (Swarm + Traefik)
.github/workflows/     a Action que monta a imagem e publica no ghcr.io
verificar.sh           confere marcação e assets das duas versões
```

**Ordem de carga do CSS obrigatória: tokens → base → site.**

O site continua sendo HTML, CSS e JS puros. O servidor existe só para
guardar o que o painel edita — sem ele os dois `index.html` abrem
igual, direto do disco.

`cloudflare-antigo/` pode ser apagada quando você tiver certeza de que
não volta para lá. Está no histórico do git de qualquer forma.

## Rodando localmente

```bash
SENHA_PAINEL=escolha-uma node servidor/servidor.js
```

Abra `http://localhost:3000` (e `/global` para a outra versão). O painel
fica em `/admin` e pede usuário `samuel` com a senha que você acabou de
definir. Local funciona tudo: salvar, subir foto, criar proposta — só que
grava em `/dados`, não no servidor de produção. Para gravar noutro lugar:

```bash
PASTA_DADOS=./dados-local SENHA_PAINEL=escolha-uma node servidor/servidor.js
```

Se quiser só olhar o layout, sem painel, qualquer servidor estático
serve — apontado para `site/`:

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory site
```

O `--bind 0.0.0.0` faz o servidor escutar em toda a rede, então dá para
abrir no celular pelo IP da máquina — útil para julgar o layout mobile num
aparelho de verdade:

```
http://<ip-da-máquina>:3000
```

Descubra o IP com `ipconfig getifaddr en0`. Se não abrir, é o firewall do
macOS bloqueando o Python.

O `.claude/launch.json` usa `autoPort`, então a porta pode variar quando
outro projeto já estiver ocupando a de sempre.

> Se um dia entrar vídeo em `video/`, troque por um servidor com suporte a
> HTTP Range — o `http.server` do Python não tem e o vídeo trava no meio.
> `npx serve` resolve.

## Como o CSS é organizado

Tudo sai de Custom Properties em `tokens.css`. Nenhum componente escreve cor
ou medida crua: todos leem variáveis. **Trocar a paleta inteira é editar um
arquivo só.**

Layout em Grid e Flexbox; medidas fluidas com `clamp()`, que escalam sozinhas
e dispensam quase toda media query.

## Como o JS é organizado

Um único `requestAnimationFrame` alimenta todos os efeitos de rolagem —
vários listeners de scroll concorrentes é o que costuma travar esse tipo de
página.

O JS só acrescenta. Sem ele a página continua inteira e navegável: as
animações são ligadas pela classe `anim-pronta`, que o próprio script
adiciona. Se ele falhar, nada some.

Técnicas centrais:

- `IntersectionObserver` revela os blocos ao entrar em cena
- `lerp` (`atual + (alvo - atual) * fator`) suaviza o movimento
- Medidas de layout em cache, recalculadas só no `resize`
- Uma **varredura de segurança** dentro do laço: o observer só entrega o que
  chega a amostrar, então um salto de âncora ou uma rolagem muito rápida
  poderia pular um bloco e deixá-lo invisível para sempre. A varredura compara
  posições em cache (aritmética pura, sem leitura de layout) e garante que
  nada se perca.

### Bibliotecas

Uma só: **Lenis** (~3 KB, via CDN), para inércia de rolagem. É opcional — se o
CDN cair, volta à rolagem nativa e o resto continua funcionando. A instância
fica em `window.lenis` para quem precisar mover a página por fora.

Os ícones de marca vêm do **simple-icons** (CC0), embutidos como sprite SVG no
próprio HTML: nenhuma requisição extra.

## Acessibilidade e performance

- `prefers-reduced-motion` desliga o laço inteiro, o Lenis e as esteiras
- Fonte auto-hospedada com `preload` (zero dependência de CDN) — Manrope
  variável, um arquivo por subset cobre os pesos 300–800 em ~40 KB
- Navegação por teclado com foco visível e link "pular para o conteúdo"
- Contraste conferido: todo texto neutro fica em 5.4:1 ou mais

### Um ponto em aberto: o laranja

`#FF4F18` rende **3.29:1** com branco — passa como elemento de interface
(≥3:1), mas fica abaixo do AA para texto (4.5:1). Isso afeta:

| Onde | Hoje | Se quiser corrigir |
|---|---|---|
| Botão "Solicitar orçamento" (branco sobre laranja) | 3.29:1 | Texto em `--ink` sobre o laranja = **5.55:1** |
| Card "Solicite seu orçamento" | 3.29:1 | idem |
| Índices `01…06` do processo (laranja sobre branco) | 3.29:1 | `--ink`, deixando o laranja só no traço |
| Índices do "Why clients work with us" | 2.99:1 | idem |

Mantive o laranja porque a identidade pede exatamente isso ("acento único —
pontos, réguas, **índices**"). A troca é de uma linha em `site.css` se você
preferir o contraste.

## Trocando o conteúdo

**Projetos** — `index.html`, seção `03`. Os três cases estão com a estrutura
certa e conteúdo genérico marcado por comentário. Cada um pede:
contexto do cliente em uma linha → problema do negócio → o que foi feito →
resultado com número. É o número que vende.

**Métricas** — seção `01`, bloco `.metricas`.

## Painel

Em `links.samuelfreire.com.br/admin`. Pede usuário e senha numa tela de
login (não é o popup do navegador), e depois abre um **hub** com três
blocos: *Criar proposta*, *Editar site ativo* e *Prospectar no Google*.
Novas funcionalidades entram como novos blocos.

```
/admin/entrar         login
/admin/               hub
/admin/site/          editor do site
/admin/propostas/     propostas
/google-prospection/  prospecção (mesma sessão do painel)
```

### A senha

Uma variável na stack, `SENHA_PAINEL`, e o usuário `samuel` (ou o que
você puser em `USUARIO_PAINEL`). O login cria um cookie assinado que
dura uma semana; trocar a senha na stack derruba todas as sessões
abertas. Oito senhas erradas seguidas do mesmo endereço bloqueiam por
dez minutos.

`/admin` e `/api` estão trancados por inteiro — leitura inclusive. Sem
sessão, a tela volta para o login e a API responde 401.

### Como o editor funciona

O painel **não escreve nos arquivos do repositório**. Ele salva no volume
`dados`: textos num JSON, imagens em pastas. O servidor injeta esse
conteúdo no HTML **antes de mandar a página** — por isso o site continua
funcionando sem JavaScript e sem perder SEO.

A consequência importante: **o HTML do repositório é o padrão**. O volume
guarda só o que foi editado. Se ele estiver vazio, o arquivo ilegível ou a
chave inexistente, o texto original do HTML permanece. Nada quebra, e o git
continua sendo a fonte da verdade.

```
Painel → /dados/conteudo.json + /dados/img
                ↓
      servidor injeta no HTML
                ↓
            visitante
```

### Editando o site

O site inteiro aparece num quadro e você edita clicando. Texto
contornado em laranja é editável — clique, escreva, Enter quebra linha,
Esc sai. Clique numa foto para trocá-la pela galeria.

Ao clicar num texto aparece uma barra com **duas ferramentas, só**:

- **Quebra** — insere uma quebra de linha no cursor
- **A− / A+** — diminui ou aumenta o tamanho do texto (*Padrão* volta ao original)

As duas valem para o dispositivo escolhido no seletor **PC / Celular**
do topo, e são **independentes**: uma quebra feita no modo Celular só
existe no celular; um tamanho mudado no PC não muda o celular. No modo
Celular o quadro estreita para 390px, que é onde essas regras passam a
valer (até 640px de largura).

Por dentro: a quebra vira `<br class="so-pc">` ou `<br class="so-celular">`
no texto, e o tamanho vira `conteudo.estilos[chave][pc|celular]`, que o
servidor transforma num `<style>` ao servir a página.

O botão *BR / Global* troca a versão que está no quadro. *Recarregar*
volta o quadro ao que está salvo mantendo o que você editou; *Descartar*
joga fora tudo desde o último salvamento. O ponto branco no **Salvar**
avisa que há alteração pendente.

As abas **Clientes** e **Projetos** são para adicionar, remover e
reordenar. Cliente sem foto mostra as iniciais; sem `@`, o arroba some.

O editor só existe no painel: o script é injetado no quadro a partir
dele. O site publicado não carrega uma linha de editor.

Cada salvamento guarda a versão anterior em `conteudo.anterior.json` — se
algo sair errado, dá para recuperar por lá.

## Propostas

Cada proposta é uma página própria em `/propostas/<id>` — por exemplo
`/propostas/hunter-interior-design`. Ela **não aparece no site nem no
Google**: sai com `noindex`, não é linkada de lugar nenhum e só abre para
quem tem o endereço.

### Fazendo uma

Painel → **Criar proposta**.

- **+ Nova proposta** já nasce preenchida com o seu **modelo**: escopo,
  o que cada entregável inclui, condições, seu texto, assinatura, frase
  final e botão. Só falta o cliente, o título e o valor.
- **Duplicar** copia uma que já existe. É o caminho normal: o miolo de uma
  proposta muda pouco de cliente para cliente. A cópia nasce como
  **rascunho**, para não ir ao ar antes de você trocar o valor.
- **Endereço** é o que vira a URL. Se deixar em branco, ele se preenche a
  partir do nome do cliente.
- **Situação** decide quem abre: *no ar* é qualquer um com o link;
  *rascunho* só você, logado.

**Investimento** é visual: escolha a moeda (R$ / $ / €), as parcelas
(à vista, 2×… 12×) e digite o valor de cada parcela. A prévia mostra o
que vai para a página — `3× R$ 1.500 · total R$ 4.500` — e a forma de
pagamento acompanha.

### O modelo

O botão **Modelo**, no topo, abre o que toda proposta nova traz
preenchido. Mude ali o que se repete; as propostas já criadas não mudam,
só as próximas. O caminho inverso também existe: dentro de uma proposta,
**Salvar como modelo** faz dela o novo padrão.

O modelo vive em `/dados/modelo-proposta.json`. Sem arquivo lá, vale a
semente `servidor/sementes/modelo-proposta.json`.

Propostas têm **botão de salvar próprio**, dentro do editor. O *Salvar* lá
de cima é só do site. Misturar os dois faria uma correção de texto do site
publicar uma proposta pela metade.

### Como ela é montada

Uma proposta não é um arquivo HTML: é um registro JSON. A página é montada
na hora, com os mesmos `tokens.css` e `base.css` do site — se a marca
mudar, as propostas antigas acompanham sozinhas. O layout vive em
`styles/proposta.css`, e o gerador em `servidor/proposta-html.js`.

Blocos vazios simplesmente não aparecem: proposta sem seção de pagamento
não renderiza um título órfão.

Alguns campos aceitam mais de uma linha:

| Campo | Formato |
|---|---|
| Itens do "inclui" | um por linha |
| Dados da conta | `Rótulo: valor`, um por linha |
| Textos longos | linha em branco separa parágrafos |

### Imprimir

A folha de estilo tem um bloco `@media print`: as faixas escuras viram
brancas, as revelações aparecem e os blocos não quebram no meio da página.
Imprimir para PDF no navegador dá um documento apresentável.

### A que já está pronta

`servidor/sementes/hunter-interior-design.json` traz a proposta da Hunter
Interior Design, com o mesmo conteúdo da que estava em
`samuelfreire.com.br/hunter-interior-design`. As sementes são copiadas para
o volume no primeiro start e **nunca sobrescrevem** o que já estiver lá:
editar pelo painel e dar deploy de novo não desfaz a edição.

## Prospecção

Em `links.samuelfreire.com.br/google-prospection`. É a ferramenta de
prospecção do MIRA (`ARQUITETURA-MIRA.md`) refeita para caber neste
servidor: sem Supabase, sem créditos, sem cadastro. Quem entra é quem
tem a senha do painel — sem sessão, a página volta para o login.

> *"Encontre quem precisa de você antes de mandar mensagem."*
> Varre os negócios de uma região, separa quem não tem site de quem tem
> site ruim, dá uma nota de oportunidade, escreve a abordagem e guarda o
> lead numa lista.

Quatro abas:

| Aba | O que faz |
|---|---|
| **Quem está no mapa** | O coração. Nicho + cidade (ou perto de você, ou as 10 capitais) → lista de negócios com telefone, site, nota, avaliações e um **score de oportunidade**. Abrir o card diagnostica o site, monta a mensagem e sugere o que recriar. |
| **Quem vende na internet** | (a) Anunciantes: abre a Biblioteca de Anúncios da Meta no nicho, você cola a página de destino e ela é diagnosticada — mensagem com o gancho de verba de clique queimada. (b) Perfis do Instagram via busca do Google (Serper), com faixa "vale a conversa". |
| **Quem está contratando** | Vagas remotas de design (Remotive, RemoteOK, WeWorkRemotely, Himalayas), sem repetição, com link para a mesma busca no LinkedIn. |
| **Minha lista** | Mini-CRM: funil cumulativo (mirado → abordado → respondeu → proposta → fechado), taxa de resposta, abordagens por semana, anotação com autosave. |

### As chaves (todas opcionais)

Nada disso é obrigatório para a stack subir. Cada chave liga uma parte:

| Variável | Liga | Sem ela |
|---|---|---|
| `GOOGLE_PLACES_KEY` | Google Places API (New): nota, nº de avaliações, opiniões, telefone, site | Cai no **OpenStreetMap** (Overpass): funciona, mas sem nota nem avaliações, e com menos negócios |
| `ANTHROPIC_API_KEY` | Botão **Escrever com IA** (Claude) — mensagem personalizada usando as opiniões e o diagnóstico | Só os modelos locais (4 versões por situação, em PT; 2 em EN) |
| `SERPER_API_KEY` | Busca de perfis do Instagram | A busca fica desligada, com aviso na tela |
| `PAGESPEED_KEY` | Só aumenta a cota do PageSpeed | Funciona igual, com a cota anônima do Google |

`/estado` mostra o que está ligado: `"prospeccao": { "mapas": "google" | "osm", "ia": true, "instagram": false }`.

Sobre a chave do Google: é a **Places API (New)**, no Google Cloud, com
faturamento ligado. A busca pede `reviews` no *field mask* — é o SKU
mais caro do Text Search (cerca de US$ 40 por mil requisições), e cada
varredura de cidade faz até 3 requisições (60 negócios); o modo Brasil
faz 10. Se quiser baratear, tire `places.reviews` da constante `MASCARA`
em `servidor/prospeccao.js` — a IA perde as opiniões, o resto continua.

### Score de oportunidade

Calculado no servidor (`pontuar` em `prospeccao.js`):

- **Sem site → começa em 70.** Soma +6 com 40+ avaliações, +6 com 150+,
  +4 se tem telefone, +3 se nota ≥ 4,5, +2 se não tem nem rede social.
- **Com site → 29 + 4·(nota − 4,5) + √avaliações**, entre 15 e 64. Quem
  tem muita avaliação já atende e fatura, então pode pagar.
- Depois do diagnóstico, no navegador: site com nota < 50 ganha +18;
  < 75 ganha +8. Site ruim é oportunidade.

Filtros: **Sem site**, **Site pra refazer**, **Mais quentes** (≥ 70),
**Com telefone**. **Copiar lista** e **Baixar CSV** respeitam o filtro.

### Diagnóstico do site

Duas camadas. A rápida roda no servidor ao abrir o card
(`prospeccao-site.js`): um `fetch` cru do HTML, sem navegador, e
heurísticas com peso — HTTPS, tempo de resposta, viewport, título,
descrição, h1, botão de contato, WhatsApp, rodapé antigo, construtor
gratuito, página vazia. Nota = 100 − Σ pesos. Estima também o **porte**
(operação enxuta / porte médio / tem equipe) pelos sinais no HTML.

A profunda é o botão **Análise profunda com o Google**: chama o
PageSpeed Insights **direto do navegador** (o Google leva 20–40 s, e não
vale segurar o servidor esse tempo). Velocidade, LCP, CLS, TBT e SEO
viram problemas com peso, mesclados por chave com os da camada rápida.
Se o Google abriu o site, os problemas "não abriu" / "barrou a leitura"
são apagados — era bloqueio de robô, não site fora do ar.

### Mensagens

Os modelos locais seguem uma estrutura fixa: *o que eu vi → o que isso
custa → o que eu já fiz (entrega antes da oferta) → fecho sem pedir
permissão*. Três bancos, escolhidos pela situação do negócio:

- **sem site e sem rede** — cliente chega e não tem pra onde ir ·
  indicação tem teto · sem site a decisão vira preço · decisão em menos
  de 1 minuto
- **só Instagram/Facebook** — direct fecha às 18h · post some do feed ·
  atendimento manual repetitivo · perfil exige rolar 15 posts
- **tem site** — site trabalha contra (usa os defeitos do diagnóstico)
  · site não mostra a prova · defeito que ninguém comentou · parado no
  tempo

O idioma vem do **país da busca**: PT para Brasil e Portugal, EN (em
formato de e-mail, com assunto) para o resto. A assinatura e o "sou
fulano, faço sites aqui de…" vêm do **Perfil** (botão no topo), gravado
em `/dados/prospeccao/perfil.json`.

Com `ANTHROPIC_API_KEY`, **Escrever com IA** manda pro Claude
(`claude-opus-5`) os dados do negócio, as opiniões do Google, os
problemas do diagnóstico e o seu perfil, com a mesma estrutura de copy
no prompt de sistema. Cada clique pede uma variação nova. Fora do
Brasil sai em inglês, como e-mail.

### Onde ficam os dados

```
/dados/prospeccao/
  perfil.json    quem assina
  leads.json     a lista inteira, um array
```

No mesmo volume `links_dados` — backup e update não mudam. A última
varredura fica no `localStorage` do navegador por 7 dias e volta sozinha
ao reabrir a página.

## Diagnóstico: `/estado`

Abra `links.samuelfreire.com.br/estado`. É a forma mais rápida de saber o
que está no ar. Fica fora de `/api` de propósito — se o painel estiver
trancado por falta de senha, esta URL ainda responde.

```json
{ "servidor": "node", "senhaConfigurada": true,
  "pastaDados": "/dados", "dadosGravaveis": true,
  "conteudoSalvo": true, "propostas": 1,
  "siteBr": true, "siteGlobal": true, "painel": true,
  "prospeccao": { "pagina": true, "mapas": "osm", "ia": false, "instagram": false },
  "pronto": true }
```

| Campo | Se vier `false` |
|---|---|
| `senhaConfigurada` | falta `SENHA_PAINEL` nas variáveis da stack |
| `dadosGravaveis` | o volume não está montado, ou o container não tem permissão de escrita nele |
| `siteBr` / `siteGlobal` / `painel` | a imagem foi montada sem esses arquivos — refaça o build |

**Não devolveu JSON nenhum** — o container não está de pé. Veja os logs da
stack no Portainer.

## Publicar

Segue o mesmo caminho dos outros aplicativos — o documento completo está
em `material/publicacao.md`. Em uma frase: o GitHub monta a imagem e guarda
no ghcr.io; o Portainer, no servidor, baixa e sobe; o Traefik entrega o
domínio e cuida do certificado.

```
git push → Action → ghcr.io/samuelfreirebr/links → Portainer → Traefik → links.samuelfreire.com.br
```

### Primeira publicação

1. **Push.** A Action "Publicar imagem" roda sozinha. Confira em
   *Actions* que ficou verde — se ficar vermelha, a imagem não existe.
2. **Tornar o pacote público.** github.com → *Packages* → `links` →
   *Package settings* → *Change visibility* → *Public*. Só uma vez. Sem
   isso o servidor recebe `pull access denied` e a task fica `rejected`.
3. **Cloudflare.** O registro A de `links.samuelfreire.com.br` apontando
   para o IP do servidor, com a **nuvem cinza** (DNS only). Laranja quebra
   a validação do certificado pelo Traefik.
4. **Portainer.** *Stacks* → *Add stack* → **Web editor** → colar o
   `docker-stack.yml` inteiro → em *Environment variables* criar
   `SENHA_PAINEL` (e, se quiser a prospecção completa, as chaves
   opcionais da seção *Prospecção*) → *Deploy the stack*.
5. Esperar uns 40 segundos e abrir `links.samuelfreire.com.br/estado`.

**Sem `SENHA_PAINEL` a stack não sobe.** É de propósito: uma tranca que
depende de alguém lembrar de ligar não tranca, e foi assim que o
`/admin` ficou aberto na versão anterior.

### Atualizar depois

`git push` → esperar a Action → Portainer → a stack → **Update the stack**
com *Re-pull image and redeploy* marcado. O volume não é tocado.

### O volume `links_dados`

O que o painel salva mora num volume do Docker, não na imagem:

```
/dados
  conteudo.json            os textos e fotos que você editou
  conteudo.anterior.json   a versão de antes do último salvar
  propostas/<id>.json      uma proposta por arquivo
  img/<pasta>/<arquivo>    as fotos que você enviou
  prospeccao/perfil.json   quem assina as mensagens da prospecção
  prospeccao/leads.json    a lista de leads
```

Update, rebuild e restart não encostam nele. **Backup é copiar essa
pasta** — em Portainer, *Volumes* → `links_links_dados` → *Browse*.
Remover o volume apaga as edições e as propostas; o site volta ao texto
do repositório, sem quebrar.

### O desvio BR/global sem a Cloudflare na frente

Quem dizia de que país vinha a visita era o cabeçalho `CF-IPCountry`, que
só existe com a nuvem laranja ligada. Com ela cinza, como o padrão manda,
**não há desvio automático**: `/` serve sempre a BR e `/global` continua
acessível pelo endereço. O código do desvio fica no servidor, dormindo —
se um dia a Cloudflare voltar para a frente, ele acorda sozinho.

### Se der errado

| O que aparece | Quem fala | O que fazer |
|---|---|---|
| `404 page not found`, texto puro | Traefik | o app não subiu — ver o serviço em `0/1`, ler os logs |
| `502 Bad Gateway` | Traefik | o app subiu mas não está na rede `SamuelFreire_RedeInterna` |
| Task `rejected` | Swarm | pacote privado no ghcr.io, ou a Action não terminou |
| Erro de certificado / 526 | Traefik ou Cloudflare | nuvem laranja ligada — deixar cinza |
| `/estado` com `senhaConfigurada: false` | o app | falta `SENHA_PAINEL` na stack |

### Cloudflare Pages — o caminho antigo

A pasta `cloudflare-antigo/functions/` é a versão do painel escrita para
Cloudflare Pages, com KV e R2. Continua no repositório e continua válida,
mas **não é o que o Docker usa** — ela fica de fora da imagem.

Se um dia voltar para lá, atenção ao que deu errado da última vez: o
projeto foi criado como **Worker** (`npx wrangler deploy`), não como
**Pages**. O wrangler perguntou se a pasta `functions` devia ser tratada
como Functions, respondeu `no` sozinho por estar em modo não interativo, e
subiu o repositório inteiro como arquivo estático — inclusive `.git`.

### O que não pode faltar em nenhum dos dois

Os dois `index.html` **não podem ser cacheados**. Eles são quem aponta para
a versão dos assets; HTML velho em cache serve CSS velho e o layout quebra de
formas confusas — aconteceu várias vezes durante o desenvolvimento. Os assets,
ao contrário, podem ter cache eterno, porque mudam de URL a cada alteração.

Depois de publicar, a regra de geo do Cloudflare entra por cima — veja
*Duas versões, um app*.

## Versão dos assets

Os `<link>` de CSS e o `<script>` levam `?v=…` no fim:

```html
<link rel="stylesheet" href="/styles/site.css?v=20260907b">
```

Isso existe porque HTML novo com CSS velho em cache quebra o layout de formas
confusas — foi o que fez o e-mail aparecer solto na barra do celular.
**Ao mexer em qualquer CSS ou no JS, suba esse número nos dois `index.html`.**

## Duas versões, um app

O mesmo aplicativo serve dois sites. O Cloudflare decide qual, pelo IP.

| Caminho | Versão | Arquivo |
|---|---|---|
| `links.samuelfreire.com.br/` | Brasil | `index.html` |
| `links.samuelfreire.com.br/global` | Fora do Brasil | `global/index.html` |

**Hoje as duas são idênticas.** É de propósito — a estrutura está pronta para
divergir quando você quiser.

Nada no site liga uma versão à outra: não há link, botão, seletor de idioma
nem menção a `/global` na versão BR. Só quem souber a URL chega lá.

### Como as duas convivem

Todos os assets (`/styles`, `/js`, `/img`, `/fonts`) são **compartilhados** e
referenciados em caminho absoluto (`/styles/site.css`, não `styles/site.css`).
É isso que faz o mesmo arquivo funcionar tanto em `/` quanto em `/global`.

Cada versão carrega uma folha própria, por último:

```
/styles/br.css       só a versão BR
/styles/global.css   só a versão global
```

E cada uma marca a si mesma na raiz do documento, então dá para divergir só
com CSS, sem duplicar HTML:

```css
:root[data-versao="global"] .hero__title { font-size: 8vw; }
```

Para divergir de verdade (texto, seções, ordem), edite o `index.html` da
versão, em `site/`. Os dois arquivos são independentes.

> **Enquanto forem idênticos:** toda alteração precisa ser feita nos dois
> arquivos. Copiar por cima resolve — `cp site/index.html site/global/index.html` e
> depois trocar `data-versao`, a canônica e a folha da versão. **Pare de
> copiar assim que a versão global tiver conteúdo próprio**, senão você
> sobrescreve o trabalho dela.

### O que configurar no Cloudflare

> **O servidor já sabe fazer o desvio** — basta receber o cabeçalho
> `CF-IPCountry`, que a Cloudflare envia quando está em modo proxy (nuvem
> laranja). Mas o padrão de publicação pede nuvem **cinza**, e aí o
> cabeçalho não chega: sem desvio automático. Ligar a laranja para ter o
> desvio implica resolver o certificado de outro jeito (modo *Full* na
> Cloudflare, por exemplo). É uma decisão sua; o código está pronto para os
> dois casos. `ROTEAR_POR_PAIS=0` desliga de vez.

Duas formas, e a escolha muda o que o visitante vê:

- **Rewrite / proxy** — a URL continua `links.samuelfreire.com.br/` e o
  conteúdo servido é o da global. É o modo **realmente invisível**: o
  visitante nunca vê `/global` na barra de endereço. É o que recomendo,
  dado que você quer que isso não apareça para ninguém.
- **Redirect** — o visitante é levado para `/global` e vê isso na URL.
  Mais simples de configurar, menos discreto.

Nenhuma das duas versões tem `noindex`, e isso é deliberado: se ela existisse
na global e você usasse **rewrite**, o `noindex` seria servido na própria URL
raiz e tiraria o site inteiro do índice do Google. A `<link rel="canonical">`
da global aponta para a raiz, o que resolve a duplicidade de conteúdo e é
seguro nos dois modos.

Um ponto para você decidir depois: o Googlebot rastreia majoritariamente de
IPs dos EUA, então **ele vai ver a versão global**. Quando as duas divergirem,
é o texto da global que tende a ser indexado. Se isso for um problema, a saída
é liberar o crawler da regra de geo no Cloudflare.

### Quando a global virar inglês

Além do texto, trocar em `global/index.html`:

- `<html lang="pt-BR" …>` → `lang="en"`
- `<meta property="og:locale" content="pt_BR">` → `en_US`

## Barra do topo

Não é fixa: rola junto com a página, como no material de referência. Três
zonas numa grade `1fr auto 1fr` — é essa grade que mantém as âncoras no
centro exato, independente da largura do logo ou do e-mail.

```
[ logo ]          [ âncoras ]          [ Email:  ·  botão Contato ]
```

A foto de perfil aparece **só no hero**. Antes ela estava na barra e no hero,
duplicada; quem carrega a identidade no topo é o logotipo em texto.

O e-mail some abaixo de 1100px e as âncoras abaixo de 860px — sobram logo e
botão, que é o que importa no celular.

O menu tem dois itens só: **Projetos** e **Contato**. Na versão global o
"Projetos" é âncora interna (`#projetos`); na BR, que é curta e não tem essa
seção, ele aponta para o Behance — que é onde os projetos estão de fato.

E-mail publicado: `samuelfreirebr@gmail.com`, nos dois arquivos.

