# Como um aplicativo meu é publicado

> Este documento existe para ser colado numa IA quando eu for criar um
> aplicativo novo. Ele explica **como eu publico**, **o que cada peça é** e
> **o que o projeto precisa ter por dentro** para publicar sem surpresa.
> Tudo aqui foi aprendido publicando de verdade — os erros no fim são reais.

---

## 1. A ideia em uma frase

O código fica no **GitHub**. Toda vez que eu mando código para lá, um robô do
GitHub **empacota o aplicativo numa imagem** e guarda essa imagem num depósito
chamado **ghcr.io**. No meu **servidor**, o **Portainer** pega essa imagem e
coloca para rodar. O **Traefik**, que já roda no servidor, recebe quem digita
o **domínio** e entrega para o aplicativo certo. Os **dados** ficam num
**volume**, que sobrevive a atualizações.

```
   eu (git push)
        │
        ▼
   GitHub  ──(Action)──►  imagem  ──►  ghcr.io   (depósito de imagens)
                                          │
                                          ▼
   Portainer (no servidor)  ──►  baixa a imagem e sobe a "stack"
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                     app (Next.js)     db (Postgres)     volume (os dados)
                        ▲
                        │
   Traefik  ◄──  hub.samuelfreire.com.br  ◄──  DNS na Cloudflare  ◄──  pessoa
```

---

## 2. O que é cada coisa

**Repositório (GitHub).** A pasta do projeto, versionada. É a única fonte do
código. Nada é editado no servidor — sempre no repositório, e o servidor
recebe o resultado.

**Action (GitHub Actions).** Um arquivo `.github/workflows/publicar.yml` que
diz ao GitHub: "toda vez que chegar código na branch `main`, construa a imagem
e publique no ghcr.io". Eu não rodo nada na minha máquina para publicar.

**Imagem (Docker).** O aplicativo inteiro empacotado com tudo o que ele
precisa para rodar — Node, dependências, o build pronto. Quem descreve como
montar a imagem é o arquivo `Dockerfile`. A imagem é a mesma em qualquer
servidor, por isso "funciona na minha máquina" deixa de existir.

**ghcr.io (GitHub Container Registry).** O depósito onde a imagem fica
guardada, com endereço tipo `ghcr.io/samuelfreirebr/hub-lancamentos:latest`.
O servidor baixa dali. **Atenção: uma imagem nova nasce PRIVADA.** O servidor
não consegue baixar sem eu tornar o pacote público (ou configurar senha no
servidor). Ver seção 7.

**Servidor.** Uma máquina Linux minha, com Docker instalado em modo **Swarm**
(um jeito de rodar vários aplicativos como "serviços"). Nela já rodam o
Portainer e o Traefik, compartilhados por todos os meus aplicativos.

**Portainer.** A tela web que administra o Docker do servidor. É onde eu colo
o arquivo da stack, preencho as variáveis e clico em "Deploy". Também é onde
vejo se o aplicativo subiu, os logs, e clico em "Update the stack" quando há
imagem nova.

**Stack.** Um arquivo `docker-stack.yml` que descreve o aplicativo inteiro
para o Swarm: quais serviços existem (o app e o banco), qual imagem cada um
usa, em quais redes estão, quais variáveis recebem, onde guardam dados, e as
etiquetas que o Traefik lê. Um arquivo = um aplicativo publicado.

**Serviço e réplica.** Dentro da stack, cada programa é um serviço (`app`,
`db`). Réplica é quantas cópias rodam. Eu uso **1 réplica** de cada, porque as
migrações do banco rodam quando o app sobe, e duas cópias subindo juntas as
aplicariam em paralelo.

**Volume.** Uma pasta do servidor que o Docker guarda **fora** do container.
O container do banco pode ser destruído e recriado mil vezes — os dados estão
no volume, e o volume fica. **É por isso que atualizar o app não apaga nada.**
Cada stack tem o seu volume (`hub_db`, `idpro_db`…).

**Rede.** Os containers conversam por redes internas do Docker. Uso duas:
- `SamuelFreire_RedeInterna` — a rede compartilhada onde o Traefik está. O
  `app` precisa estar nela para o Traefik alcançá-lo.
- `interna` — uma rede privada só desta stack, onde estão `app` e `db`. O
  banco fica **só** nela: nenhum outro aplicativo do servidor o enxerga, e ele
  não publica porta nenhuma para fora.

**Traefik.** O porteiro do servidor. Recebe todas as visitas nas portas 80 e
443, olha o domínio digitado e entrega ao serviço certo. Ele descobre os
aplicativos sozinho lendo **etiquetas** (`labels`) na stack — não existe
arquivo de configuração do Traefik por aplicativo. Ele também pede e renova o
**certificado HTTPS** (Let's Encrypt) sozinho.

**Domínio e Cloudflare.** O domínio `samuelfreire.com.br` está na Cloudflare.
Para cada aplicativo eu crio um **subdomínio** (`hub.`, `idpro.`) apontando
para o **IP do servidor**, com um registro do tipo **A**. **A nuvem laranja
(proxy) precisa estar DESLIGADA** (cinza, "DNS only"): com o proxy ligado a
Cloudflare fica no meio do caminho e o Traefik não consegue validar o
certificado HTTPS.

**Variáveis de ambiente.** As configurações que mudam de servidor para
servidor e os segredos: senha do banco, chave da OpenAI, e-mail e senha do
administrador. Elas **nunca vão para o GitHub**. Eu preencho no Portainer, no
campo "Environment variables" da stack.

---

## 3. A stack tecnológica

| Peça | O que uso | Por quê |
|---|---|---|
| Framework | **Next.js 15**, App Router, `output: "standalone"` | Uma coisa só faz site, API e servidor. O `standalone` gera uma pasta enxuta para a imagem |
| Linguagem | **TypeScript**, modo estrito | Erro aparece antes de publicar |
| Visual | **Tailwind CSS v4** | Sem arquivo de configuração; os tokens (cores, fontes) vivem no CSS |
| Banco | **PostgreSQL 16** | Roda num container ao lado do app, com os dados num volume |
| Acesso ao banco | **Prisma 6** | Migrações versionadas no repositório e aplicadas sozinhas na subida |
| Login | **JWT** com a biblioteca `jose`, em cookie `httpOnly` | Funciona no middleware do Next sem consultar o banco |
| Senhas | `bcryptjs` | Nunca guardo senha em texto |
| Validação | **Zod** | Toda rota valida o que recebe antes de tocar no banco |
| IA | OpenAI via `fetch` direto | Sem SDK: menos dependência para quebrar |

---

## 4. O que o projeto PRECISA ter para ser publicável

Um aplicativo novo, para entrar nesse fluxo, precisa destes arquivos. Sem
qualquer um deles a publicação falha em algum ponto.

```
meu-app/
├── Dockerfile                  ← como montar a imagem (4 estágios, ver abaixo)
├── .dockerignore               ← o que NÃO entra na imagem
├── docker-stack.yml            ← o aplicativo descrito para o Swarm/Portainer
├── docker/
│   ├── entrypoint.sh           ← o que roda ANTES do app subir (migrações, admin)
│   └── criar-usuario.mjs       ← cria/atualiza o administrador a partir das variáveis
├── .github/workflows/
│   └── publicar.yml            ← a Action que constrói e publica no ghcr.io
├── prisma/
│   ├── schema.prisma           ← o modelo do banco
│   └── migrations/             ← TODAS as migrações, versionadas no git
├── public/                     ← precisa EXISTIR no git (ver erro 3 na seção 7)
├── .env.example                ← as variáveis, documentadas, sem valores reais
├── .env                        ← só local; está no .gitignore
├── next.config.ts              ← com output: "standalone"
└── src/
    ├── middleware.ts           ← protege as rotas: sem cookie válido, vai para /login
    ├── app/                    ← páginas e rotas de API (App Router)
    ├── lib/
    │   ├── env.ts              ← lê e valida as variáveis de ambiente UMA vez
    │   ├── prisma.ts           ← a instância única do Prisma
    │   ├── auth.ts             ← cria e verifica o JWT
    │   └── api.ts              ← o envelope route(): exige sessão, trata erros
    └── components/
```

### O Dockerfile em quatro estágios

1. **deps** — instala as dependências (`npm ci`).
2. **build** — copia o código e roda `npm run build`. O `prebuild` roda o
   `prisma generate`. Aqui também: `RUN mkdir -p /app/public`.
3. **migrator** — instala a CLI do Prisma isolada, para o entrypoint aplicar
   migrações sem carregar o `node_modules` inteiro.
4. **runner** — a imagem final, enxuta: só a saída `standalone`, os arquivos
   estáticos, o schema do Prisma, a CLI de migração e o entrypoint. Roda como
   usuário sem privilégio. Define `HOSTNAME=0.0.0.0` e `PORT=3000`.

### O entrypoint — o que acontece quando o container sobe

1. Espera o banco aceitar conexão (até 60 tentativas). **O Swarm ignora
   `depends_on`**: app e banco sobem juntos, e o banco demora uns segundos.
2. Roda `prisma migrate deploy` — aplica as migrações que faltam.
3. Cria ou atualiza o administrador com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
   Trocar a senha na stack e atualizar também serve para recuperar o acesso.
4. Semeia dados iniciais, se o app tiver (só se ainda não existirem).
5. Sobe o Next (`node server.js`).

### A stack — o que cada bloco faz

```yaml
services:
  app:
    image: ghcr.io/USUARIO/NOME-DO-APP:latest
    networks: [SamuelFreire_RedeInterna, interna]     # Traefik + banco
    environment:
      - HOSTNAME=0.0.0.0                              # ver erro 1 na seção 7
      - PORT=3000
      - DATABASE_URL=postgresql://app:${POSTGRES_PASSWORD:-app_interno}@db:5432/app?schema=public
      - AUTH_SECRET=${AUTH_SECRET}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    deploy:
      replicas: 1
      placement: { constraints: [node.role == manager] }
      labels:                                         # é isto que o Traefik lê
        - traefik.enable=true
        - traefik.docker.network=SamuelFreire_RedeInterna
        - traefik.http.routers.NOME.rule=Host(`NOME.samuelfreire.com.br`)
        - traefik.http.routers.NOME.entrypoints=websecure
        - traefik.http.routers.NOME.tls.certresolver=letsencryptresolver
        - traefik.http.routers.NOME.service=NOME
        - traefik.http.services.NOME.loadbalancer.server.port=3000

  db:
    image: postgres:16-alpine
    networks: [interna]                               # SÓ a privada
    volumes: [NOME_db:/var/lib/postgresql/data]       # os dados
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-app_interno}
    deploy:
      replicas: 1
      placement: { constraints: [node.role == manager] }  # o volume é do nó

volumes:
  NOME_db:

networks:
  SamuelFreire_RedeInterna: { external: true }        # já existe no servidor
  interna: { driver: overlay }                        # criada com a stack
```

As **labels ficam dentro de `deploy:`** — fora dele o Swarm as ignora e o
Traefik nunca vê o aplicativo.

### As variáveis que eu preencho no Portainer

| Variável | O que é |
|---|---|
| `AUTH_SECRET` | Assina o cookie de login. Gero com `openssl rand -base64 32` |
| `OPENAI_API_KEY` | Se o app usa IA. Vazia = a geração fica desligada, o resto funciona |
| `ADMIN_EMAIL` | Meu login |
| `ADMIN_PASSWORD` | Minha senha |

Tudo o mais tem valor padrão dentro da stack. A senha do Postgres **não
precisa** ser preenchida: o banco não publica porta e só existe na rede
privada — a senha não protege nada de fora.

---

## 5. O passo a passo de uma publicação nova

1. **Criar o repositório vazio no GitHub** e apontar o projeto para ele:
   `git remote add origin git@github.com:USUARIO/NOME.git && git push -u origin main`
2. **Esperar a Action ficar verde** em Actions → "Publicar imagem". Se ficar
   vermelha, a imagem não existe — abrir e ler o erro.
3. **Tornar o pacote público**: github.com → Packages → o pacote → Package
   settings → Change visibility → Public. **Só na primeira vez.**
4. **Criar o subdomínio na Cloudflare**: registro A → IP do servidor → nuvem
   laranja desligada.
5. **No Portainer**: Stacks → Add stack → Web editor → colar o
   `docker-stack.yml` → preencher as 4 variáveis → Deploy.
6. **Esperar uns 40 segundos** e abrir o domínio.

### Para atualizar depois

`git push` → esperar a Action → Portainer → a stack → **Update the stack**
(com "pull latest image" marcado). Os dados não são tocados: estão no volume.

---

## 6. Como diagnosticar pelo texto do erro

| O que aparece | Quem está falando | O que significa | O que fazer |
|---|---|---|---|
| `404 page not found`, texto puro | Traefik | Nenhuma rota casou → **o app não está rodando** | Ver se o serviço mostra `0/1`; ler as tasks e os logs |
| `502 Bad Gateway` | Traefik | O app está rodando mas o Traefik não o alcança | Conferir `HOSTNAME=0.0.0.0` e a label `traefik.docker.network` |
| Task com estado `rejected` | Swarm | O servidor não conseguiu nem baixar a imagem | Pacote privado no ghcr.io, ou a Action nunca terminou |
| Logs vazios | — | O container nunca chegou a iniciar | Mesmo caso acima |
| Erro de certificado | Traefik | Não conseguiu validar o HTTPS | Nuvem laranja da Cloudflare ligada; desligar |
| "Falha de conexão" na tela de login | O app | O app subiu e o banco não | Ler os logs do serviço `db` |
| Página do Next dizendo "could not be found" | O app | O app está de pé; a rota é que não existe | Bug no app, não na publicação |

---

## 7. Erros que já cometi — regras para não repetir

1. **`HOSTNAME=0.0.0.0` é obrigatório.** O Docker preenche `HOSTNAME` sozinho
   com o nome do container, e o Next passa a escutar em um IP só. Como o app
   está em duas redes, o Traefik chega pela outra e recebe recusa: **502**.

2. **A Action precisa de `permissions: packages: write`** e de forçar o nome
   da imagem em minúsculas. Nome de imagem não aceita maiúscula, e o nome de
   usuário do GitHub pode ter.

3. **A pasta `public/` precisa existir no git.** O git não versiona pasta
   vazia. Se `public/` está vazia, ela não chega ao build, e o `COPY
   /app/public` do Dockerfile falha com `"/app/public": not found`. Solução:
   um arquivo `.gitkeep` dentro dela **e** `RUN mkdir -p /app/public` no
   Dockerfile.

4. **O pacote no ghcr.io nasce privado.** Primeira publicação de todo app
   novo: tornar público, senão o servidor recebe `pull access denied` e o
   Swarm marca a task como `rejected`.

5. **A senha do Postgres fica gravada no volume na primeira subida.** Trocar
   a variável depois **não** troca a senha do banco — só quebra a conexão.
   Por isso ela tem valor padrão na stack e não é para mexer.

6. **O Swarm ignora `depends_on`.** O entrypoint precisa esperar o banco.

7. **Labels do Traefik fora de `deploy:` são ignoradas** no Swarm.

8. **Cloudflare com proxy ligado quebra o certificado.** Nuvem cinza.

9. **Uma réplica só.** Migrações rodam na subida; duas réplicas as aplicariam
   ao mesmo tempo.

10. **Segredo nunca vai para o git.** `.env` no `.gitignore`; valores reais só
    no Portainer. Antes de cada commit: `grep -r "sk-" src/` para conferir.

11. **Nunca rodar `npm run build` com `next dev` rodando** na mesma pasta:
    corrompe a pasta `.next`.

12. **`prisma migrate dev` é interativo** e falha em ambiente sem terminal. Em
    produção é sempre `prisma migrate deploy`. Renomear coluna: escrever a
    migração à mão com `RENAME COLUMN`, senão o Prisma dropa e recria — e
    perde os dados.

---

## 8. O que dizer para a IA ao começar um app novo

> Copie o bloco abaixo, junto com este documento inteiro.

```
Vou criar um aplicativo novo que será publicado do mesmo jeito dos meus
outros. Leia o documento "Como um aplicativo meu é publicado" e:

1. Use a mesma stack: Next.js 15 App Router com output standalone,
   TypeScript estrito, Tailwind v4, Prisma 6 + PostgreSQL, JWT com jose em
   cookie httpOnly, Zod nas rotas.

2. Crie desde o início: Dockerfile de quatro estágios, .dockerignore,
   docker/entrypoint.sh (espera o banco, migra, cria o admin),
   docker/criar-usuario.mjs, .github/workflows/publicar.yml,
   docker-stack.yml no padrão da seção 4, .env.example, e a pasta public/
   com um .gitkeep.

3. Na stack: rede externa SamuelFreire_RedeInterna, rede privada interna
   para o banco, volume NOME_db, HOSTNAME=0.0.0.0, uma réplica, placement no
   manager, labels do Traefik dentro de deploy:, certresolver
   letsencryptresolver. Domínio: NOME.samuelfreire.com.br.

4. Só quatro variáveis obrigatórias no Portainer: AUTH_SECRET,
   OPENAI_API_KEY (se houver IA), ADMIN_EMAIL, ADMIN_PASSWORD. Todo o resto
   com valor padrão.

5. Aplique as 12 regras da seção 7 sem que eu precise lembrar.

6. Antes de me dizer que está pronto para publicar, rode npm run build e
   confirme que passou.
```

---

*Última revisão: setembro de 2026. Aplicativos publicados neste padrão:
IDPRO (`idpro.samuelfreire.com.br`) e Hub de Lançamentos
(`hub.samuelfreire.com.br`).*
