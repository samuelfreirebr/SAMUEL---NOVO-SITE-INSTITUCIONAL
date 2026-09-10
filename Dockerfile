# ============================================================
#  Site + painel + propostas, num container só.
#
#  Node puro, sem dependência nenhuma: não há npm install, não
#  há build. O que entra na imagem é exatamente o que é site —
#  .git, functions/ e os arquivos de trabalho ficam de fora.
# ============================================================

FROM node:22-alpine

WORKDIR /app

# O servidor.
COPY servidor/ ./servidor/

# O site. Listado item a item de propósito: um "COPY . ." publicaria
# o .git inteiro, e foi assim que o repositório vazou no deploy anterior.
COPY index.html ./site/index.html
COPY global/    ./site/global/
COPY admin/     ./site/admin/
COPY styles/    ./site/styles/
COPY js/        ./site/js/
COPY fonts/     ./site/fonts/
COPY img/       ./site/img/

# Os dados ficam no volume. A pasta é criada aqui e entregue ao
# usuário sem privilégio, senão o container não consegue gravar.
RUN mkdir -p /dados && chown -R node:node /dados /app
USER node

ENV PORTA=3000 \
    PASTA_SITE=/app/site \
    PASTA_DADOS=/dados \
    NODE_ENV=production

EXPOSE 3000
VOLUME ["/dados"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/estado').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "servidor/servidor.js"]
