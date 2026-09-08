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
python3 -m http.server 4173
```

Depois abra `http://localhost:4173`.

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

