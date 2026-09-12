# Como um site meu é construído e publicado

> Este documento existe para ser colado numa IA quando eu for criar um
> site novo nesta estrutura. Ele explica **como o site é feito por
> dentro** e **como vira uma pasta que sobe em qualquer hospedagem**.
> Tudo aqui foi aprendido construindo e publicando de verdade; os erros
> do fim são reais.
>
> É o irmão do "Como um aplicativo meu é publicado" (`publicacao.md`).
> Aquele é para aplicativos com banco e servidor. Este é para **sites**:
> HTML, CSS e JavaScript puros, sem servidor nenhum.

---

## 1. A ideia em uma frase

O site é **HTML + CSS + JavaScript puros** — sem framework, sem build,
sem npm, sem servidor. Abre direto do disco. Publicar é gerar uma pasta
(`dist/`) com as imagens otimizadas e subir essa pasta no `public_html`
da hospedagem pelo gerenciador de arquivos. Só isso.

```
 site/                              dist/
 index.html · styles/ · js/         cópia congelada, imagens em WebP,
 fonts/ · img/                 →    .htaccess com cache               →   public_html/
 (o que eu edito)                   (o que sobe)                            (hospedagem)
```

---

## 2. O que é cada coisa

**`site/`** — o site inteiro, como o visitante recebe. Tudo o que eu
edito está aqui. É a fonte.

**`styles/tokens.css`** — toda cor, fonte, espaço, raio e tempo do site
é uma variável aqui. Nenhum componente escreve valor cru. Mudar a marca
é mudar este arquivo.

**`styles/base.css`** — reset, tipografia, botões, `.section`, `.rule`,
utilitários. O que é igual em qualquer seção.

**`styles/site.css`** — cada seção da página, uma depois da outra.

**`js/main.js`** — todo o comportamento: revelação ao rolar, esteiras
(carrosséis), efeito do hero. Um arquivo, sem dependência.

**`dist/`** — a cópia congelada de `site/`, com JPG/PNG convertidos
para WebP, as referências trocadas no HTML e um `.htaccess` com regras
de cache. É o que sobe. Gera-se de novo a cada alteração.

**`?v=`** — cada CSS e JS é carregado com `?v=AAAAMMDDx` na URL. Mudou
o arquivo, muda a letra. É o que faz o navegador buscar a versão nova
em vez da que está no cache.

---

## 3. Regras de construção

Estas regras não são estilo — cada uma evita um problema que aconteceu.

### CSS

- **Ordem de carga obrigatória: `tokens.css → base.css → site.css`.**
- Tudo sai de `var()`. Cor crua, medida crua ou fonte crua num
  componente é erro.
- Tamanhos fluidos com `clamp()`. Grid e Flexbox; nada de float.
- Coluna de grid que recebe texto é `minmax(0, 1fr)`, nunca `1fr` solto:
  `fr` respeita o `min-content` e um título longo estoura a coluna.
- Seções têm `background` próprio. O hero é `sticky` e fica atrás; uma
  seção transparente o deixaria aparecer através dela.
- Margem em elemento filho **colapsa para fora** de uma seção sem
  padding e vira um vão transparente. Espaço entre blocos é `padding`
  da seção, não `margin` do filho.
- Sem gradiente de cor, sem sombra, sem card flutuante. Separação é
  hairline (`--hair`, 1px). A única "sombra" permitida é `inset` de 1px
  para borda de botão vazado.
- `mask-image` para esteira sumir nas bordas é permitido: é máscara,
  não tinta.
- Manchete com `text-wrap: balance` e os pares que não podem separar
  travados com `&nbsp;` ("de&nbsp;7D", "e&nbsp;previsibilidade"). Quebra
  de linha diferente por dispositivo: `<br class="so-celular">` e
  `<br class="so-pc">` — cada uma só existe no seu lado (regras em
  `base.css`, corte em 640px).
- No celular, o hero preenche a primeira tela inteira:
  `min-height: calc(100svh - var(--nav-h))`, botões no pé (`margin-top:
  auto`). `svh` é a altura com a barra de endereço visível — a de quando
  o site abre.

### JavaScript

- **Aditivo.** A página é completa sem JS. As animações de entrada só
  existem depois que o script adiciona `anim-pronta` ao `<html>` — se
  o script falhar antes, nada fica invisível.
- **Um único `requestAnimationFrame`** alimenta todos os efeitos de
  rolagem. Nada mais escuta `scroll`.
- Layout é medido **fora** do laço e guardado em cache. Remedir só em
  `resize` — e só quando a **largura** mudou: no celular, rolar dispara
  `resize` (a barra de endereço some e volta), e remedir à toa reinicia
  esteiras.
- Ao remedir, **preservar posição** (`desloc % largura`), nunca zerar.
- Revelação por `IntersectionObserver` com um varredor de segurança no
  laço: um bloco pulado pela rolagem rápida não pode ficar invisível
  para sempre.
- `prefers-reduced-motion` desliga o laço inteiro.
- Lenis (rolagem suave) é a única biblioteca, via CDN, opcional.
- Esteiras aceitam arrastar com dedo ou mouse: enquanto segura, a
  posição é do gesto; ao soltar, a velocidade vira impulso que decai
  por cima da velocidade de cruzeiro — nunca "para e volta".
  `touch-action: pan-y` no elemento deixa a rolagem vertical da página
  intacta.
- Foto que não decodifica é removida do DOM (`blindarFotos`): o `span`
  atrás guarda as iniciais, e a lista continua legível.

### HTML

- **Caminhos absolutos** (`/styles/…`, `/img/…`), nunca relativos.
  Relativo quebra assim que a URL ganha ou perde uma barra no fim.
  (Para publicar em subpasta, a `dist` recebe um prefixo — ver §5.)
- Fonte auto-hospedada (`fonts/*.woff2`), com `preload` do subset
  latino e `unicode-range` para o estendido. Nunca Google Fonts.
- Assets levam `?v=`. **Bumpar a versão DEPOIS de editar o arquivo**,
  nunca antes: bumpar antes faz o navegador guardar a versão velha sob
  o nome novo.
- Os `index.html` **nunca** em cache (`no-cache`); assets com cache
  eterno (`immutable`) — eles mudam de URL a cada alteração. As duas
  regras vão no `.htaccess`.
- `<link rel="canonical">` no `index.html`. Sem `noindex`.
- Imagens com `width` e `height` no `<img>` (sem pulo de layout) e
  `loading="lazy"` fora da primeira tela.
- Ícones em sprite SVG inline no fim do `<body>`, referenciados com
  `<use href="#i-nome">`.

### Identidade (a deste site — troca-se por site)

Uma cor de destaque (`--brand: #FF4F18`), tinta `#141517`, branco,
cinza `#F2F4F7`, secundário `#5B6470`. Manrope 300–800, display em 800
com tracking −0.035 a −0.055em. Eyebrow: 600, caixa alta, tracking
0.14–0.22em, sempre com um ponto laranja antes. Métrica: numeral grande
com régua de 2px acima. Fotos com raio de 5px. Detalhes gráficos só
pequenos (quadrado de 9px, ponto de 5px, traço curto). Botões: texto à
esquerda, seta dentro de um círculo à direita; hover inverte o botão e
gira a seta para a direita. Tom editorial, suíço, mínimo. **Contraste
conferido**: `#9AA3AF` dá 2,55:1 sobre branco e reprova no AA — texto
secundário usa `#5B6470` (6:1).

---

## 4. O que o projeto precisa ter

```
meu-site/
├── site/
│   ├── index.html                ← a página
│   ├── styles/
│   │   ├── tokens.css            ← TODAS as variáveis
│   │   ├── base.css              ← reset, tipografia, botões, .section, .rule
│   │   └── site.css              ← cada seção
│   ├── js/main.js                ← todo o comportamento
│   ├── fonts/*.woff2             ← auto-hospedada, dois subsets
│   └── img/                      ← já otimizado (WebP onde possível)
├── verificar.sh                  ← confere canônica, noindex e caminhos dos assets
├── material/                     ← trabalho: apresentação, originais, ESTE documento
├── .gitignore                    ← .DS_Store, dist/, dist*.zip, originais pesados
└── LEIA-ME.md
```

### Testar localmente

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory site
```

`--bind 0.0.0.0` deixa abrir no celular pelo IP da máquina — o único
jeito honesto de julgar o layout mobile. Se houver vídeo, o
`http.server` não serve (sem HTTP Range): usar `npx serve site`.

`./verificar.sh` confere canônica, ausência de `noindex` e caminhos
absolutos. `./verificar.sh 3000` bate ainda cada asset contra o
servidor local.

---

## 5. Publicar: gerar a `dist` e subir

### Gerar

1. **Copiar de `site/` só o que o HTML referencia**: as folhas de
   estilo que ele carrega, `js/main.js`, os dois `.woff2` do
   `@font-face`, e as imagens usadas. Nada de material de trabalho.
2. **Converter JPG/PNG para WebP** (qualidade ~0,84) e trocar as
   referências no HTML. Favicon fica PNG: WebP como ícone de aba não
   abre no Safari. Sem `cwebp`/ImageMagick na máquina, o próprio Chrome
   converte via `canvas.toBlob('image/webp')` — um servidor descartável
   de 40 linhas recebe o resultado e grava.
3. **`.htaccess`** com as regras de cache (HTML `no-cache`, assets
   `immutable`), `AddType` para `.webp` e `.woff2`, e compressão —
   tudo dentro de `<IfModule>` para não quebrar em host sem o módulo.
4. **Zipar o conteúdo, não a pasta** — para o "Extract" do gerenciador
   deixar os arquivos direto no lugar.
5. **Testar antes de entregar**: servir a `dist` localmente e bater
   cada URL que o HTML referencia. A meta é "N arquivos, 0 faltando".

### Raiz ou subpasta — decide os caminhos

- **Raiz do domínio** (`public_html/`): a `dist` normal, com caminhos
  `/styles/…`.
- **Subpasta** (`public_html/pagina-teste/`): gerar uma segunda `dist`
  com **prefixo** nos caminhos (`/pagina-teste/styles/…`). Caminhos
  relativos (`styles/…`) não servem — quebram sem a barra final na URL.
  O `url("../fonts/…")` do CSS é relativo ao arquivo CSS e funciona nos
  dois casos. Links para a raiz (`href="/"`) viram `#topo` ou o prefixo.

### Subir

1. Gerenciador de arquivos → `public_html` (ou a subpasta)
2. Upload do zip
3. Botão direito → Extract, no mesmo lugar
4. Apagar o zip (ficaria acessível publicamente à toa)
5. Abrir o domínio

`.htaccess` começa com ponto e alguns gerenciadores escondem: "Show
hidden files".

### Subindo onde já existe um WordPress

- Na raiz, o `index.php` do WordPress **ganha** do `index.html` — o
  site estático fica invisível. Use uma subpasta.
- **Nunca substituir o `.htaccess` do WordPress.** O da `dist` só pode
  ir para dentro da subpasta. Se sobrescrever o da raiz, a home continua
  abrindo mas **toda página interna vira 404**. Conserto: wp-admin →
  Configurações → Links permanentes → Salvar (o WordPress reescreve o
  arquivo). Depois apagar da raiz o que não é do WordPress:
  `index.html`, `styles`, `js`, `fonts`, `img`.

### Pixel, tags e redirecionamentos

- **Pixel do Facebook, Google Tag Manager, Analytics**: um `<script>`
  no `<head>` do `index.html`. Vale só para aquele site. Eventos nos
  botões (`fbq('track', 'Contact')` no clique do orçamento). Pede aviso
  de cookies (LGPD).
- **Redirecionamentos**: linhas no `.htaccess` (`Redirect 301 /antigo
  /novo`), só para a pasta onde ele está.
- **Webhooks**: o site estático **envia** (um `fetch` no clique ou no
  envio de formulário, para Make/Zapier/n8n), mas **não recebe** — não
  há servidor escutando.

---

## 6. Diagnóstico

| O que aparece | Causa | O que fazer |
|---|---|---|
| Texto solto, sem cor nem layout | CSS não carregou: subiu em subpasta com caminhos de raiz | gerar `dist` com prefixo |
| Fotos quebradas, só as iniciais dos clientes | pasta `img` fora do lugar | conferir a árvore em `public_html` |
| "Index of /" ou a página antiga da hospedagem | `index.html` não está direto na pasta | mover um nível acima |
| Ainda aparece o WordPress | `index.php` ganha do `index.html` na raiz | subpasta |
| Páginas internas do WordPress em 404 | `.htaccess` sobrescrito | Links permanentes → Salvar |
| 403 Forbidden | permissões | arquivos `644`, pastas `755` |
| Alteração não aparece | cache do navegador | bumpar `?v=` (depois de editar) e limpar dados do site |
| Fonte genérica no lugar da Manrope | `fonts/` ausente ou `.htaccess` sem `AddType font/woff2` | conferir os dois |

---

## 7. Erros que já cometi — regras para não repetir

1. **Bumpar `?v=` só depois de editar.** Bumpei antes, editei depois:
   o navegador guardou o arquivo velho sob o nome novo, e passei uma
   hora achando que o CSS "não aplicava".
2. **HTML nunca em cache.** É ele que aponta a versão dos assets; HTML
   velho serve CSS velho e o layout quebra de formas confusas.
3. **`margin` de filho colapsa para fora da seção** e vira um vão
   transparente onde o hero sticky aparece. Espaço é `padding` da seção.
4. **`1fr` respeita `min-content`.** Título longo numa coluna `fr` a
   estoura. Sempre `minmax(0, 1fr)`.
5. **`resize` no celular é disparado pela barra de endereço ao rolar.**
   Remedir e zerar esteiras a cada `resize` fazia todos os carrosséis
   reiniciarem a cada rolada. Só remedir se a largura mudou; ao
   remedir, preservar posição.
6. **Botão com conteúdo mais largo que o próprio botão vaza pela
   borda.** Dois botões dividindo uma linha no celular precisam de
   `flex: 1 1 0; min-width: 0` e conteúdo que caiba na metade — medir
   em 360px, não só em 375.
7. **`min-height: auto` no hero mobile** deixa a seção seguinte
   aparecer antes de rolar. `100svh` menos a barra.
8. **Contraste não se supõe.** `#9AA3AF` parecia fino e reprovava no AA.
   Conferir a proporção antes de usar cor clara em texto.
9. **`.htaccess` da `dist` na raiz de um WordPress** derruba as
   páginas internas dele. Subpasta, sempre.
10. **WebP como favicon** não abre no Safari. Favicon fica PNG.
11. **`python3 -m http.server` não suporta HTTP Range**: vídeo trava.
    Para testar com vídeo, `npx serve`.
12. **Instagram não dá para raspar.** Perfil público devolve tela de
    login, e as URLs de foto são assinadas e expiram. Foto de cliente é
    arquivo que o cliente manda.
13. **Fotos corrompidas na fonte** (base64 incompleto) o navegador
    recusa em silêncio. `blindarFotos()` remove a `<img>` que não
    decodifica e as iniciais assumem.
14. **O painel de navegação da IA pausa `requestAnimationFrame` quando
    está oculto**: capturas saem em branco e a rolagem "não anda". Não
    é bug do site. Verificar por medição no DOM, não por screenshot.
15. **Quebra de manchete não se chuta.** Medir as linhas reais em
    quatro tamanhos de tela (1440, 1280, 1024, 375) e travar os pares
    com `&nbsp;` — só então escolher o tamanho.

---

## 8. O que dizer para a IA ao começar um site novo

> Copie o bloco abaixo, junto com este documento inteiro.

```
Vou criar um site novo na mesma estrutura dos meus outros. Leia o
documento "Como um site meu é construído e publicado" e:

1. Stack: HTML + CSS + JavaScript puros. Sem framework, sem build, sem
   npm, sem servidor. Arquivos: site/index.html,
   site/styles/{tokens,base,site}.css, site/js/main.js, site/fonts/,
   site/img/. Ordem de carga tokens → base → site, obrigatória.

2. CSS só com variáveis de tokens.css; clamp() para tamanhos; grid com
   minmax(0, 1fr); seções com background próprio e espaço por padding.
   Sem gradiente, sem sombra. Contraste AA conferido. Hero mobile
   preenchendo 100svh menos a barra.

3. JS aditivo (classe anim-pronta), um único requestAnimationFrame,
   IntersectionObserver com varredor de segurança, medidas em cache
   remedidas só quando a largura muda, prefers-reduced-motion desliga
   tudo. Lenis opcional via CDN. Esteiras arrastáveis com inércia.

4. Caminhos absolutos, fonte auto-hospedada com preload, ?v= nos
   assets bumpado DEPOIS de editar, canônica no index.html, sem
   noindex, width/height em toda <img>.

5. Um script que gera dist/: copia só o que o HTML referencia,
   converte JPG/PNG para WebP (favicon fica PNG), escreve o .htaccess
   com cache dentro de <IfModule>, zipa o conteúdo — e uma variante
   com prefixo de subpasta.

6. Aplique as 15 regras da seção 7 sem que eu precise lembrar.

7. Antes de me dizer que está pronto: ./verificar.sh passando, a dist
   servida localmente com "N arquivos, 0 faltando", e as quebras da
   manchete medidas em 1440, 1280, 1024 e 375.
```

---

*Última revisão: setembro de 2026. Site publicado neste padrão:
`samuelfreire.com.br/pagina-teste`.*
