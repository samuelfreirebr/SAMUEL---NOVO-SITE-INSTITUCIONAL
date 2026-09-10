# Samuel Freire — site institucional

HTML + CSS + JavaScript puros. Sem framework, sem build, sem npm.
São arquivos estáticos: sobem em qualquer hospedagem.

## Arquivos

```
index.html             versão BR
global/index.html      versão internacional
admin/                 painel de edição
styles/tokens.css      variáveis (cores, fontes, espaços, tempos)
styles/base.css        reset, tipografia, botões, utilitários
styles/site.css        cada seção da página
styles/proposta.css    layout das propostas
js/main.js             todo o comportamento
fonts/                 Manrope auto-hospedada (.woff2)
img/                   retrato + bastidores + clientes

servidor/              o servidor Node (sem dependência nenhuma)
  servidor.js          rotas, arquivos, tranca
  injetar.js           põe o texto editado no HTML antes de servir
  dados.js             textos, imagens e propostas no volume
  proposta-html.js     monta a página de uma proposta
  seguranca.js         senha do painel
  multipart.js         leitura do upload de imagem
  listas.js            clientes, bastidores, projetos
  sementes/            propostas que já vêm no repositório

functions/             caminho antigo, só do Cloudflare Pages. Não é usado
                       pelo deploy em Docker e fica fora da imagem.
```

O site continua sendo HTML, CSS e JS puros. O servidor existe só para
guardar o que o painel edita — sem ele os dois `index.html` abrem
igual, direto do disco.

**Ordem de carga obrigatória: tokens → base → site.**

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

Se quiser só olhar o layout, sem painel, qualquer servidor estático serve:

```bash
python3 -m http.server 3000 --bind 0.0.0.0
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

## Painel de edição

Em `links.samuelfreire.com.br/admin`. Edita textos, sobe fotos e gerencia
clientes e projetos — do computador ou do celular.

### Como funciona

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

### A senha

Uma variável na stack, `SENHA_PAINEL`, e o usuário `samuel` (ou o que você
puser em `USUARIO_PAINEL`). O navegador pede as duas coisas ao abrir
`/admin` e não pergunta de novo até você fechá-lo.

`/admin` e `/api` estão trancados por inteiro — **leitura inclusive**.
Antes só a gravação era checada, e a lista de imagens ficava visível para
quem descobrisse o endereço.

Trocar a senha é trocar a variável e dar *Update the stack*.

### Usando

**Editar site** é a aba principal: o site inteiro aparece num quadro e você
edita clicando. Texto contornado em laranja é editável — clique, escreva,
Enter quebra linha, Esc sai. Clique numa foto para trocá-la pela galeria.

O botão *BR / Global* troca a versão que está no quadro. *Recarregar* volta o
quadro ao que está salvo mantendo o que você editou; *Descartar* joga fora
tudo desde o último salvamento.

O ponto branco no botão **Salvar** avisa que há alteração pendente. Nada vai
ao ar antes de salvar, e o navegador avisa se você tentar sair com edição
solta.

As outras abas são para o que não dá para fazer clicando:

- **Clientes e projetos** — adicionar, remover e reordenar. Cliente sem foto
  mostra as iniciais; sem `@`, o arroba some.
- **Propostas** — veja a seção abaixo.

Para trocar uma foto, clique nela. Dentro do "Escolher imagem" dá para
arrastar uma nova para a área tracejada, sem sair do que estava fazendo.

O editor só existe no painel: o script é injetado no quadro a partir dele. O
site publicado não carrega uma linha de editor, e quem visita nunca recebe
nada disso.

Cada salvamento guarda a versão anterior em `conteudo.anterior.json` — se
algo sair errado, dá para recuperar por lá.

## Propostas

Cada proposta é uma página própria em `/propostas/<id>` — por exemplo
`/propostas/hunter-interior-design`. Ela **não aparece no site nem no
Google**: sai com `noindex`, não é linkada de lugar nenhum e só abre para
quem tem o endereço.

### Fazendo uma

Painel → aba **Propostas**.

- **+ Nova proposta** começa em branco.
- **Duplicar** copia uma que já existe. É o caminho normal: o miolo de uma
  proposta muda pouco de cliente para cliente. A cópia nasce como
  **rascunho**, para não ir ao ar antes de você trocar o valor.
- **Endereço** é o que vira a URL. Se deixar em branco, ele se preenche a
  partir do nome do cliente.
- **Situação** decide quem abre: *no ar* é qualquer um com o link;
  *rascunho* só você, logado.

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

## Diagnóstico: `/estado`

Abra `links.samuelfreire.com.br/estado`. É a forma mais rápida de saber o
que está no ar. Fica fora de `/api` de propósito — se o painel estiver
trancado por falta de senha, esta URL ainda responde.

```json
{ "servidor": "node", "senhaConfigurada": true,
  "pastaDados": "/dados", "dadosGravaveis": true,
  "conteudoSalvo": true, "propostas": 1,
  "siteBr": true, "siteGlobal": true, "painel": true,
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

### Portainer — o caminho de hoje

Tudo num container: site, painel e propostas. Não há build, não há
`npm install`, não há dependência — só Node servindo os arquivos.

1. Portainer → *Stacks* → *Add stack* → *Repository*
2. Aponte para este repositório e use `docker-compose.yml`
3. Em **Environment variables**, crie:

   | Nome | Valor |
   |---|---|
   | `SENHA_PAINEL` | a senha do painel — escolha uma longa |
   | `USUARIO_PAINEL` | opcional, o padrão é `samuel` |

4. Deploy. O site sobe na porta **8080** do host
5. Aponte o proxy/DNS de `links.samuelfreire.com.br` para essa porta

**Sem `SENHA_PAINEL` a stack não sobe.** É de propósito: uma proteção que
depende de alguém lembrar de ligar não é proteção, e foi assim que o
`/admin` ficou aberto na versão anterior.

#### Repository, não Web editor

O `docker-compose.yml` manda **construir** a imagem (`build: .`). Para
isso o Portainer precisa ter os arquivos do projeto, e ele só os tem
quando clona o repositório. No *Web editor* não existe pasta nenhuma: o
build falha mesmo com o YAML certo.

Se aparecer:

```
YAMLSyntaxError: Document contains trailing content
not separated by a ... or --- line
```

foi o `Dockerfile` colado no campo do compose. São arquivos diferentes com
papéis diferentes: o `Dockerfile` diz *como montar a imagem*, o
`docker-compose.yml` diz *como rodar o container*. O Portainer quer o
segundo — e, em modo *Repository*, nem isso precisa ser colado: basta o
caminho `docker-compose.yml`.

Lido como YAML, a primeira linha do Dockerfile (`FROM node:22-alpine`)
vira um valor solto e a seguinte (`WORKDIR /app`) vira "conteúdo
sobrando". Daí a mensagem.

#### O volume `dados`

O que o painel salva mora num volume do Docker, não na imagem:

```
/dados
  conteudo.json            os textos e fotos que você editou
  conteudo.anterior.json   a versão de antes do último salvar
  propostas/<id>.json      uma proposta por arquivo
  img/<pasta>/<arquivo>    as fotos que você enviou
```

Rebuild, update e restart da stack não encostam nele. **Backup é copiar
essa pasta** — em Portainer, *Volumes* → `dados` → *Browse*. Remover o
volume apaga as edições e as propostas; o site volta ao texto do
repositório, sem quebrar.

#### Atualizar depois de mexer no código

*Stacks* → a stack → **Update the stack** com *Re-pull image and redeploy*
marcado. O volume sobrevive.

### Cloudflare Pages — o caminho antigo

A pasta `functions/` é a versão do painel escrita para Cloudflare Pages,
com KV e R2. Continua no repositório e continua válida, mas **não é o que
o Docker usa** — ela fica de fora da imagem.

Se um dia voltar para lá, atenção ao que deu errado da última vez: o
projeto foi criado como **Worker** (`npx wrangler deploy`), não como
**Pages**. O wrangler perguntou se a pasta `functions` devia ser tratada
como Functions, respondeu `no` sozinho por estar em modo não interativo, e
subiu o repositório inteiro como arquivo estático — inclusive `.git`. Tem
que ser *Workers & Pages* → *Create* → **Pages** → *Connect to Git*, com
build command vazio e output directory `/`.

### Cloudflare na frente, servidor atrás

Dá para juntar os dois: o servidor continua no Portainer e a Cloudflare
fica só como DNS em modo proxy. É isso que mantém o desvio automático
BR/global, porque quem diz de que país veio a visita é o cabeçalho
`CF-IPCountry`, que só a Cloudflare envia. Sem ela, `/` sempre serve a
versão BR e `/global` continua acessível pelo endereço. Para desligar o
desvio de vez, ponha `ROTEAR_POR_PAIS=0` nas variáveis da stack.

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
versão. Os dois arquivos são independentes.

> **Enquanto forem idênticos:** toda alteração precisa ser feita nos dois
> arquivos. Copiar por cima resolve — `cp index.html global/index.html` e
> depois trocar `data-versao`, a canônica e a folha da versão. **Pare de
> copiar assim que a versão global tiver conteúdo próprio**, senão você
> sobrescreve o trabalho dela.

### O que configurar no Cloudflare

> **Com o site no Portainer, o desvio já vem pronto no servidor.** Basta a
> Cloudflare estar em modo proxy no DNS: ela envia o cabeçalho
> `CF-IPCountry` e o servidor serve a global para quem não é do Brasil, sem
> mudar a URL. Não precisa de Worker nem de regra. Para desligar, ponha
> `ROTEAR_POR_PAIS=0` nas variáveis da stack. O que segue vale para o caso
> de você preferir resolver isso na própria Cloudflare.

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

