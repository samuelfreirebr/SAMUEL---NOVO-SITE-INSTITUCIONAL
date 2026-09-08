#!/usr/bin/env bash
# Confere se as duas versões estão com a marcação certa e se todos os
# assets que elas pedem existem. Rode depois de mexer nos arquivos.
#
#   ./verificar.sh            (só os arquivos)
#   ./verificar.sh 4173       (também bate os assets contra o servidor local)

set -u
cd "$(dirname "$0")"
porta="${1:-}"
falhas=0

erro() { printf '  \033[31m✗\033[0m %s\n' "$1"; falhas=$((falhas+1)); }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }

checa_versao() {
  local arquivo="$1" versao="$2" folha="$3"
  echo "$arquivo"
  grep -q "data-versao=\"$versao\"" "$arquivo" \
    && ok "data-versao=\"$versao\"" || erro "data-versao errado (esperado \"$versao\")"
  grep -q "/styles/$folha.css" "$arquivo" \
    && ok "carrega /styles/$folha.css" || erro "não carrega /styles/$folha.css"
  grep -q 'rel="canonical"' "$arquivo" \
    && ok "canônica presente" || erro "canônica ausente"
  grep -q 'name="robots"[^>]*noindex' "$arquivo" \
    && erro "tem noindex — quebra o SEO se o Cloudflare usar rewrite" \
    || ok "sem noindex"
  # caminhos precisam ser absolutos: relativo quebra em /global
  local rel
  rel=$(grep -oE '(src|href)="(img|fonts|styles|js)/' "$arquivo" | wc -l | tr -d ' ')
  [ "$rel" = "0" ] && ok "todos os assets em caminho absoluto" \
                   || erro "$rel asset(s) em caminho relativo — quebram em /global"
}

echo "── Marcação das versões ──────────────────────────────"
checa_versao index.html        br     br
echo
checa_versao global/index.html global global

echo
echo "── Uma versão não pode apontar para a outra ──────────"
grep -q '"/global' index.html && erro "index.html menciona /global" || ok "index.html não menciona /global"

if [ -n "$porta" ]; then
  echo
  echo "── Assets no servidor (porta $porta) ─────────────────"
  for f in $(grep -hoE '(src|href)="/(img|fonts|styles|js)/[^"]*"' index.html global/index.html \
             | sed 's/.*="//;s/"//' | sort -u); do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$porta$f")
    [ "$codigo" = "200" ] && ok "$f" || erro "$f -> HTTP $codigo"
  done
fi

echo
[ "$falhas" -eq 0 ] && echo "Tudo certo." || echo "$falhas problema(s)."
exit "$falhas"
