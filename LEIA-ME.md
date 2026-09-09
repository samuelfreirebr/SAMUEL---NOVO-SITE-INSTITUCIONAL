# Samuel Freire — site institucional

HTML + CSS + JavaScript puros. Sem framework, sem build, sem npm.
São arquivos estáticos: sobem em qualquer hospedagem.

## Arquivos

```
index.html
styles/tokens.css    variáveis (cores, fontes, espaços, tempos)
styles/base.css      reset, tipografia, botões, utilitários
styles/site.css      cada seção da página
js/main.js           todo o comportamento
fonts/               Manrope auto-hospedada (.woff2)
img/                 retrato + bastidores
```

**Ordem de carga obrigatória: tokens → base → site.**

## Rodando localmente

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

Depois abra `http://localhost:3000` (e `/global/` para a outra versão).

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

O painel **não escreve nos arquivos do repositório**. Ele salva no Cloudflare:
textos no **KV**, imagens no **R2**. Uma Function (`functions/_middleware.js`)
injeta esse conteúdo no HTML **no servidor**, antes de a página chegar ao
visitante — por isso o site continua funcionando sem JavaScript e sem perder
SEO.

A consequência importante: **o HTML do repositório é o padrão**. O KV guarda
só o que foi editado. Se o KV estiver vazio, a Function cair ou a chave não
existir, o texto original do HTML permanece. Nada quebra, e o git continua
sendo a fonte da verdade.

```
Painel → KV (textos) + R2 (imagens)
                ↓
        Function injeta no HTML
                ↓
            visitante
```

### O que você precisa configurar no Cloudflare

Isto eu não consigo fazer por você — são cliques no painel deles.

**1. KV** — *Workers & Pages* → *KV* → *Create namespace*, nome `conteudo-site`.
Depois, no projeto do Pages → *Settings* → *Functions* → *KV namespace bindings*:
variável **`CONTEUDO`** apontando para ele.

**2. R2** — *R2* → *Create bucket*, nome `midia-site`.
No projeto → *Settings* → *Functions* → *R2 bucket bindings*:
variável **`MIDIA`** apontando para ele.

**3. Senha do painel** — no projeto do Pages → *Settings* →
*Environment variables* → *Add variable*, como **Secret**:

| Nome | Valor |
|---|---|
| `SENHA_PAINEL` | a senha que você escolher |

O usuário é `samuel`. O navegador pede as duas coisas ao abrir `/admin`.

**Enquanto essa variável não existir, o painel fica trancado para todo mundo**
— inclusive para você. É de propósito: uma proteção que depende de alguém
lembrar de ligar não é proteção. A tela avisa o que fazer.

**4. Cloudflare Access (opcional, mais forte)** — se quiser login pelo Google
em vez de senha: *Zero Trust* → *Access* → *Applications* → *Self-hosted*,
domínio `links.samuelfreire.com.br`, caminhos `admin` e `api`, política
*Allow* → *Emails* → `samuelfreirebr@gmail.com`.

Qualquer uma das duas chaves abre o painel; basta ter uma.

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
- **Fotos** — arraste para a área tracejada. Também dá para enviar direto de
  dentro do "Escolher imagem", sem sair do que estava fazendo.

O editor só existe no painel: o script é injetado no quadro a partir dele. O
site publicado não carrega uma linha de editor, e quem visita nunca recebe
nada disso.

Cada salvamento guarda a versão anterior em `site:anterior` no KV — se algo
sair errado, dá para recuperar por lá.

## Diagnóstico: `/estado`

Abra `links.samuelfreire.com.br/estado`. É a forma mais rápida de saber o que
está no ar. Fica fora de `/api` de propósito — se o painel estiver trancado por
falta de senha, esta URL ainda responde.

**Devolveu JSON** — as Functions estão rodando. O campo `faltando` diz o que
ainda precisa ser ligado:

```json
{ "functions": true, "senhaConfigurada": false,
  "kvLigado": true, "r2Ligado": true,
  "faltando": ["SENHA_PAINEL (variável secreta)"], "pronto": false }
```

**Devolveu a página do site, ou erro 404** — as Functions **não** estão
rodando. É a causa de: painel abrindo sem pedir senha, e "o servidor
respondeu algo que não é JSON" ao salvar. Verifique, no projeto do Pages:

1. *Settings* → *Builds & deployments* → **Build output directory** precisa
   ser a raiz (`/`), não uma subpasta. A pasta `functions/` tem que ficar na
   raiz do que é publicado.
2. *Deployments* → o último deploy é de um commit que **já contém**
   `functions/`? Se for anterior, force um novo com *Retry deployment*.
3. O projeto está conectado ao Git? Projetos criados por *Direct Upload*
   (arrastar pasta) só executam Functions se a pasta `functions/` tiver sido
   incluída no envio.

## Publicar

Dois caminhos. Os arquivos dos dois já estão no repositório.

### Cloudflare Pages — o mais simples

Você já usa Cloudflare para a regra de geo, então tudo fica no mesmo lugar
e não precisa de Docker nem de servidor.

1. Cloudflare → **Workers & Pages** → *Create* → *Pages* → *Connect to Git*
2. Escolha este repositório
3. Build settings: **deixe tudo vazio**. Não há build — são arquivos
   estáticos. *Build command* em branco, *output directory* `/`
4. Deploy
5. *Custom domains* → adicione `links.samuelfreire.com.br`

O arquivo `_headers` já está aqui e o Pages o lê sozinho: os dois
`index.html` ficam sem cache e os assets com cache longo.

> **O painel exige Cloudflare Pages.** Ele roda em Functions, que são do
> Pages — no Portainer o site funciona, mas `/admin` não. Se for por esse
> caminho, os textos voltam a ser editados no HTML.

### Portainer — se preferir seu próprio servidor

`Dockerfile`, `nginx.conf` e `docker-compose.yml` estão prontos.

1. Portainer → *Stacks* → *Add stack* → *Repository*
2. Aponte para este repositório, arquivo `docker-compose.yml`
3. Deploy. O site sobe na porta **8080** do host
4. Aponte o proxy/DNS de `links.samuelfreire.com.br` para essa porta

> Estes arquivos **não foram testados** — o Docker não estava rodando na
> máquina onde o site foi construído. A configuração está correta no papel,
> mas o primeiro `docker build` é seu.

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

