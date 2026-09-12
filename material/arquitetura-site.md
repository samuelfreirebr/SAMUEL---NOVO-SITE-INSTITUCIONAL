# Como um site meu é construído e publicado

> Este documento existe para ser colado numa IA quando eu for criar um
> site novo nesta estrutura. Ele explica **como o site é feito por
> dentro**, **como o painel de edição funciona** e **os dois jeitos de
> publicar** — no meu servidor (com painel) ou como pasta estática em
> qualquer hospedagem (sem painel). Tudo aqui foi aprendido construindo
> e publicando de verdade; os erros do fim são reais.
>
> Este é o irmão do "Como um aplicativo meu é publicado"
> (`publicacao.md`). Aquele é para aplicativos com banco e Next.js. Este
> é para **sites**: HTML, CSS e JavaScript puros.

---

## 1. A ideia em uma frase

O site é **HTML + CSS + JavaScript puros** — sem framework, sem build,
sem npm. Abre direto do disco. Em volta dele existe um **servidor Node
pequeno**, sem nenhuma dependência, que faz três coisas: serve os
arquivos, injeta no HTML o que foi editado no **painel**, e guarda
esses dados num **volume**. O servidor é opcional: sem ele o site é uma
pasta que sobe em qualquer hospedagem.

```
 ┌──────────────── site/ ─────────────────┐
 │ index.html · styles/ · js/ · img/ …     │  ← HTML/CSS/JS puros, abre sozinho
 └────────────────────────────────────────┘
        │                          │
        │ (A) com painel           │ (B) sem painel
        ▼                          ▼
 servidor/ (Node)              dist/ (pasta)
 injeta o que foi editado      HTML congelado, imagens em WebP
 + painel em /admin            sobe no public_html de qualquer host
        │
        ▼
 Portainer + Traefik  →  links.samuelfreire.com.br
```

---

## 2. O que é cada coisa

**`site/`** — o site inteiro, como vai ao ar. Tudo o que o visitante
recebe está aqui. É a única pasta que a `dist` copia.

**`servidor/`** — o Node. `servidor.js` (rotas), `injetar.js` (põe o
conteúdo editado no HTML), `dados.js` (o volume), `seguranca.js`
(login), `proposta-html.js` (páginas de proposta). Zero `import` de
fora — só módulos `node:`.

**Painel (`/admin`)** — tela de login, depois um hub com blocos: *Editar
site* (o site inteiro num quadro, editável por clique) e *Propostas*.
Salva no volume, nunca nos arquivos do repositório.

**Injeção** — o HTML do repositório tem marcações (`data-edit`,
`data-edit-img`, `data-lista`). Ao servir a página, o servidor troca o
miolo dessas marcações pelo que está salvo no volume. **O HTML do
repositório é o padrão**: volume vazio, chave inexistente ou arquivo
ilegível → o texto original permanece, nada quebra.

**Volume (`/dados`)** — `conteudo.json` (textos, imagens, tamanhos),
`propostas/<id>.json`, `modelo-proposta.json`, `img/` (uploads).
Sobrevive a update, rebuild e restart. Backup é copiar a pasta.

**`dist/`** — a versão congelada: o HTML **que está no ar** (com as
edições do painel já dentro), CSS, JS, fontes e imagens convertidas para
WebP. Não tem painel, não tem servidor. É o que sobe numa hospedagem
comum via gerenciador de arquivos.

**Tokens (`styles/tokens.css`)** — toda cor, fonte, espaço, raio e tempo
do site é uma variável aqui. Nenhum componente escreve valor cru.
Mudar a marca é mudar este arquivo.

---

## 3. Regras de construção

Estas regras não são estilo — cada uma evita um problema que aconteceu.

### CSS

- **Ordem de carga obrigatória: `tokens.css → base.css → site.css`**, e
  depois a folha da versão (`br.css` ou `global.css`).
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
- Lenis (rolagem suave) é a única biblioteca, via CDN, opcional. Onde
  se edita texto (painel), o Lenis é destruído — ele rouba clique e
  seleção.
- Esteiras aceitam arrastar: enquanto o dedo segura, a posição é dele;
  ao soltar, a velocidade vira impulso que decai por cima da velocidade
  de cruzeiro. `touch-action: pan-y` no elemento deixa a rolagem
  vertical da página intacta.

### HTML

- **Caminhos absolutos** (`/styles/…`, `/img/…`), nunca relativos: a
  versão `/global` quebraria. (Exceção: a `dist` para subpasta, que
  recebe um prefixo — ver §6.)
- Fonte auto-hospedada (`fonts/*.woff2`), com `preload` do subset
  latino e `unicode-range` para o estendido.
- Assets levam `?v=AAAAMMDDx` na URL. **Bumpar a versão DEPOIS de
  editar o arquivo**, nunca antes: bumpar antes faz o navegador guardar
  a versão velha sob o nome novo.
- Os `index.html` **nunca** em cache (`no-cache`); assets com cache
  eterno (`immutable`) — eles mudam de URL a cada alteração.
- Texto editável: `data-edit="versao.secao.campo"`. Imagem editável:
  `data-edit-img`. Lista gerada (clientes, projetos): `data-lista`.
  **Nunca aninhar `data-edit` dentro de `data-edit`** — a chave de
  dentro fica inalcançável.
- Quebra de linha por dispositivo: `<br class="so-celular">` e
  `<br class="so-pc">` (o painel insere). Tamanho de texto por
  dispositivo: `conteudo.estilos[chave][pc|celular]`, que o injetor
  transforma em `<style>` com media queries fechadas dos dois lados
  (`min-width: 641px` / `max-width: 640px`).

### Identidade (a deste site — troca-se por site)

Uma cor de destaque (`--brand: #FF4F18`), tinta `#141517`, branco,
cinza `#F2F4F7`, secundário `#5B6470`. Manrope 300–800, display em 800
com tracking −0.035 a −0.055em. Eyebrow: 600, caixa alta, tracking
0.14–0.22em, sempre com um ponto laranja antes. Métrica: numeral grande
com régua de 2px acima. Fotos com raio de 5px. Detalhes gráficos só
pequenos (quadrado de 9px, ponto de 5px, traço curto). Tom editorial,
suíço, mínimo. **Contraste conferido**: `#9AA3AF` dá 2,55:1 sobre
branco e reprova no AA — texto secundário usa `#5B6470` (6:1).

### Duas versões, um app

`/` (BR) e `/global` são dois `index.html` independentes, com
`data-versao` no `<html>`, canônica apontando para a raiz, e **sem
`noindex`** (com rewrite, o `noindex` da global mataria a raiz no
Google). O desvio automático por país depende do cabeçalho
`CF-IPCountry`, que só chega com a Cloudflare em modo proxy — e o
padrão de publicação pede nuvem cinza. Então, por padrão, não há
desvio: `/` é BR e `/global` fica acessível pelo endereço.

---

## 4. O que o projeto precisa ter

```
meu-site/
├── site/
│   ├── index.html                ← versão principal
│   ├── global/index.html         ← segunda versão (se houver)
│   ├── admin/
│   │   ├── entrar.html           ← login (única página aberta sob /admin)
│   │   ├── index.html            ← hub
│   │   ├── painel.css
│   │   ├── site/index.html       ← editor visual (+ editor.js injetado no quadro)
│   │   └── propostas/index.html  ← propostas (se houver)
│   ├── styles/
│   │   ├── tokens.css            ← TODAS as variáveis
│   │   ├── base.css              ← reset, tipografia, botões, .section, .rule
│   │   ├── site.css              ← cada seção
│   │   ├── br.css · global.css   ← o pouco que só uma versão tem
│   │   └── proposta.css
│   ├── js/main.js                ← todo o comportamento
│   ├── fonts/*.woff2
│   └── img/                      ← já otimizado (WebP onde possível)
├── servidor/
│   ├── servidor.js · injetar.js · dados.js · seguranca.js
│   ├── multipart.js · listas.js · proposta-html.js
│   └── sementes/                 ← propostas e modelo que já vêm no repo
├── Dockerfile                    ← copia SÓ site/ e servidor/, node:22-alpine, USER node
├── docker-stack.yml              ← Swarm: imagem do ghcr.io, labels do Traefik em deploy:
├── .github/workflows/publicar.yml← node --check em servidor/*.js, monta e publica a imagem
├── .dockerignore                 ← .git, material/, cloudflare-antigo/, *.md
├── .gitignore                    ← .DS_Store, dist/, dist*.zip, originais pesados
├── verificar.sh                  ← confere marcação das versões e assets
├── material/                     ← trabalho: apresentação, originais, ESTE documento
└── LEIA-ME.md
```

### O servidor, por rota

```
/                    site       (HTML + conteúdo injetado)
/global              segunda versão
/propostas/<id>      página de proposta (noindex; rascunho só logado)
/admin/entrar        login (aberta)
/admin/…             painel (sessão obrigatória; sem ela, volta ao login)
/api/entrar, /sair   abertas
/api/…               conteudo, imagens, propostas, modelo-proposta (sessão)
/img/…               repositório primeiro, volume depois
/estado              diagnóstico em JSON, sem revelar valor nenhum
```

Regras do servidor que não podem faltar:

- **Lista de permissão** para o que é servido (`styles`, `js`, `fonts`,
  `img`, `index.html`, …). Nada que comece com `.`. Rodando fora do
  container a raiz é o repositório, e sem a lista o `.git` vaza.
- **Falha fechado**: sem `SENHA_PAINEL`, `/admin` e `/api` negam para
  todo mundo. Uma tranca que depende de alguém lembrar de ligar não
  tranca.
- Sessão = cookie assinado com chave derivada da senha (trocar a senha
  derruba todas as sessões). `HttpOnly`, `SameSite=Lax`, `Secure` quando
  `X-Forwarded-Proto: https`. Freio: 8 erros do mesmo IP → 10 min.
- Diretório sob `/admin` sem barra final → `308` com a barra. Sem isso
  um `import './editor.js'` resolve para `/editor.js` e a página abre
  morta.
- Gravação atômica no volume (temporário + rename) e a versão anterior
  guardada a cada salvar.

---

## 5. Publicar — caminho A: meu servidor (com painel)

É o mesmo fluxo do `publicacao.md`: push → Action monta a imagem e
publica em `ghcr.io/samuelfreirebr/<nome>` → Portainer (Web editor,
`docker-stack.yml`) → Traefik entrega o domínio e o certificado.

Diferenças em relação a um aplicativo:

- **Sem banco, sem entrypoint, sem `public/`.** Só `site/` e
  `servidor/` entram na imagem.
- **Uma variável obrigatória**: `SENHA_PAINEL`. Opcional:
  `USUARIO_PAINEL` (padrão `samuel`), `ROTEAR_POR_PAIS` (padrão 1).
- **Volume** `<nome>_dados` montado em `/dados`.
- **Nuvem cinza** na Cloudflare. Laranja quebra o Let's Encrypt — e
  cada tentativa falha conta no limite de 5 por hora do Let's Encrypt.
  Se o certificado não sair em 15 min, é isso; esperar a hora vencer.

Primeira vez: push → Action verde → tornar o pacote público no ghcr.io
→ DNS (A, cinza) → Portainer → `/estado` deve responder `"pronto": true`.

---

## 6. Publicar — caminho B: pasta estática (sem painel)

Para hospedagem comum (cPanel, gerenciador de arquivos, `public_html`).
Serve para teste, para um domínio secundário, ou para quem só tem
hospedagem compartilhada.

### Gerar a `dist`

1. **HTML: pegar o que está no ar**, não o do repositório:
   `curl https://<site>/ > index.html`. É o que tem as edições do
   painel já injetadas (inclusive o `<style data-painel-estilos>`).
2. Copiar só o que esse HTML referencia: `styles/` (as folhas que ele
   carrega), `js/main.js`, `fonts/` (os dois `.woff2` do `@font-face`),
   `img/` (só as imagens usadas).
3. **Converter JPG/PNG para WebP** (qualidade ~0,84) e trocar as
   referências no HTML. Favicon fica PNG: WebP como ícone não abre no
   Safari. Sem `cwebp`/ImageMagick na máquina, o próprio Chrome converte
   via `canvas.toBlob('image/webp')` — um servidor descartável de 40
   linhas recebe o resultado e grava.
4. `.htaccess` com as mesmas regras de cache do servidor Node, tudo
   dentro de `<IfModule>` para não quebrar em host sem o módulo.
5. Zipar **o conteúdo**, não a pasta — para o "Extract" do gerenciador
   deixar os arquivos direto no lugar.
6. Testar servindo a pasta localmente e batendo cada URL referenciada:
   32 arquivos, 0 faltando, antes de entregar.

### Raiz ou subpasta — decide os caminhos

- **Raiz do domínio** (`public_html/`): a `dist` normal, com caminhos
  `/styles/…`.
- **Subpasta** (`public_html/pagina-teste/`): gerar uma segunda `dist`
  com **prefixo** nos caminhos (`/pagina-teste/styles/…`). Caminhos
  relativos (`styles/…`) não servem — quebram sem a barra final na URL.
  O `url("../fonts/…")` do CSS é relativo ao arquivo CSS e funciona nos
  dois casos.

### O que a `dist` não tem

Painel, propostas, `/estado`, injeção. É uma foto: o que for editado no
painel depois **não** aparece nela. Para atualizar, gera-se de novo. A
canônica continua apontando para o domínio principal — bom para teste
(o Google não indexa a cópia como site separado); se a cópia virar o
oficial, a tag muda.

### Subindo onde já existe um WordPress

- Na raiz, o `index.php` do WordPress **ganha** do `index.html` — o
  site estático fica invisível. Use uma subpasta.
- **Nunca substituir o `.htaccess` do WordPress.** O da `dist` só pode
  ir para dentro da subpasta. Se sobrescrever o da raiz, a home continua
  abrindo mas **toda página interna vira 404**. Conserto: wp-admin →
  Configurações → Links permanentes → Salvar (o WordPress reescreve o
  arquivo). Depois apagar da raiz o que não é do WordPress:
  `index.html`, `styles`, `js`, `fonts`, `img`.

---

## 7. Diagnóstico

`/estado` (só no caminho A) responde JSON:

```json
{ "servidor": "node", "senhaConfigurada": true, "dadosGravaveis": true,
  "conteudoSalvo": true, "propostas": 2, "siteBr": true, "painel": true,
  "pronto": true }
```

| O que aparece | Quem fala | Causa | O que fazer |
|---|---|---|---|
| `404 page not found`, texto puro | Traefik | o container não subiu | Services → `<nome>_app` → Tasks/logs |
| `SyntaxError … does not provide an export` nos logs | Node | arquivos do servidor de versões diferentes na mesma imagem | ver erro 12 abaixo |
| `526` / certificado inválido pela Cloudflare | Cloudflare | nuvem laranja | cinza |
| `TRAEFIK DEFAULT CERT` por mais de 15 min | Traefik | Let's Encrypt limitou por tentativas | esperar 1 h; não reiniciar nem redeploy |
| "não seguro" no navegador depois do certificado sair | navegador | exceção guardada do certificado provisório | limpar dados do site |
| `/estado` com `senhaConfigurada: false` | o site | falta `SENHA_PAINEL` | variável na stack |
| painel abre mas o `import` de `editor.js` dá 404 | servidor | `/admin/site` sem barra final | redirect 308 (já existe) |
| página estática sem CSS | hospedagem | subiu em subpasta com caminhos de raiz | gerar `dist` com prefixo |
| páginas internas do WordPress em 404 | WordPress | `.htaccess` sobrescrito | Links permanentes → Salvar |

---

## 8. Erros que já cometi — regras para não repetir

1. **Bumpar `?v=` só depois de editar.** Bumpei antes, editei depois:
   o navegador guardou o arquivo velho sob o nome novo, e passei uma
   hora achando que o CSS "não aplicava".
2. **HTML nunca em cache.** É ele que aponta a versão dos assets; HTML
   velho serve CSS velho e o layout quebra de formas confusas.
3. **`margin` de filho colapsa para fora da seção** e vira um vão
   transparente onde o hero sticky aparece. Espaço é `padding` da seção.
4. **`1fr` respeita `min-content`.** Título longo numa coluna `fr` a
   estoura. Sempre `minmax(0, 1fr)`.
5. **`data-edit` aninhado** deixa a chave interna inalcançável. Um
   elemento editável por trecho de texto.
6. **Um helper `talvez(cond, html)` que recebe o template pronto não
   protege nada** — o template é montado antes da chamada, e
   `pag.forma` com `pag` ausente derruba a página. O segundo argumento
   tem que ser uma função.
7. **`COPY . .` no Dockerfile publicou o `.git` inteiro.** Copiar só
   `site/` e `servidor/`, item por item.
8. **Lista de permissão no servidor estático**, não lista de bloqueio:
   fora do container a raiz é o repositório e `/.git/HEAD` respondia
   200.
9. **`resize` no celular é disparado pela barra de endereço ao rolar.**
   Remedir e zerar esteiras a cada `resize` fazia todos os carrosséis
   reiniciarem a cada rolada. Só remedir se a largura mudou; ao
   remedir, preservar posição.
10. **Stack de Swarm ignora `build:`.** Compose com `build: .` e modo
    Repository no Portainer não sobem. A imagem vem do registro; o
    Portainer usa Web editor.
11. **Nuvem laranja da Cloudflare na frente do Traefik** quebra o
    Let's Encrypt, e as tentativas falhas contam no limite por hora.
12. **Commit pela metade.** Um `git add -A` levou um `seguranca.js`
    reescrito junto de um `servidor.js` ainda antigo. A imagem morria na
    primeira linha. Servidor é commitado inteiro ou nada — e a Action
    agora confere que os módulos carregam juntos antes de montar a
    imagem.
13. **`/admin` sem barra final** faz `import './editor.js'` resolver
    para `/editor.js`. Redirect 308.
14. **Credencial na URL** (`http://user:senha@host`) bloqueia `fetch()`
    na página inteira — o navegador recusa. Não serve nem para teste.
15. **`.htaccess` da `dist` na raiz de um WordPress** derruba as
    páginas internas dele. Subpasta, sempre.
16. **`python3 -m http.server` não suporta HTTP Range**: vídeo trava.
    Para testar com vídeo, `npx serve` ou o próprio servidor Node.
17. **O painel de navegação da IA pausa `requestAnimationFrame` quando
    está oculto**: capturas saem em branco e a rolagem "não anda". Não
    é bug do site. Verificar por medição no DOM, não por screenshot.

---

## 9. O que dizer para a IA ao começar um site novo

> Copie o bloco abaixo, junto com este documento inteiro.

```
Vou criar um site novo na mesma estrutura dos meus outros. Leia o
documento "Como um site meu é construído e publicado" e:

1. Stack: HTML + CSS + JavaScript puros. Sem framework, sem build, sem
   npm. Arquivos: site/index.html, site/styles/{tokens,base,site}.css,
   site/js/main.js, site/fonts/, site/img/. Ordem de carga tokens →
   base → site, obrigatória.

2. CSS só com variáveis de tokens.css; clamp() para tamanhos; grid com
   minmax(0, 1fr); seções com background próprio e espaço por padding.
   Sem gradiente, sem sombra. Contraste AA conferido.

3. JS aditivo (classe anim-pronta), um único requestAnimationFrame,
   IntersectionObserver com varredor de segurança, medidas em cache
   remedidas só quando a largura muda, prefers-reduced-motion desliga
   tudo. Lenis opcional via CDN. Esteiras arrastáveis com inércia.

4. Marcar todo texto editável com data-edit="versao.secao.campo",
   imagem com data-edit-img, lista com data-lista. Nunca aninhar.

5. Servidor Node sem dependências, com as rotas da seção 4: injeção
   server-side, painel com login por cookie assinado, lista de
   permissão para estáticos, falha fechado sem SENHA_PAINEL, /estado.

6. Publicação A: Dockerfile copiando só site/ e servidor/,
   docker-stack.yml para Swarm com labels do Traefik em deploy:,
   Action publicando em ghcr.io. Publicação B: script que gera dist/
   (HTML do ar + WebP + .htaccess), com variante de prefixo para
   subpasta.

7. Assets com ?v=, bumpados DEPOIS de editar. HTML no-cache, assets
   immutable.

8. Aplique as 17 regras da seção 8 sem que eu precise lembrar.

9. Antes de me dizer que está pronto: node --check em servidor/*.js,
   confirmar que os módulos importam uns aos outros sem erro, subir o
   servidor do zero e bater cada rota (site, painel sem sessão → login,
   com sessão → 200, /.git/HEAD → 404).
```

---

*Última revisão: setembro de 2026. Site publicado neste padrão:
`links.samuelfreire.com.br` (caminho A) e `samuelfreire.com.br/pagina-teste`
(caminho B, teste).*
