# Filão — mineração de referências de mercado digital

Painel: https://claude.ai/code/artifact/a2786a98-bfe9-430d-95c5-ff00ef1eeafe

Todo dia, uma rotina na nuvem garimpa os vídeos que mais "estouraram" (acima
da média histórica de cada perfil) entre ~15 criadores gringos fixos de
marketing/negócio online, mais buscas por virais do nicho fora desse banco.
Você abre o painel, bate o olho nos ganchos já resumidos, aprova o que quer
gravar, e gera o roteiro adaptado pro Brasil quando for produzir.

## Como funciona (visão rápida)

1. **Coleta** — YouTube (API oficial), Instagram (Meta Graph
   `business_discovery`), TikTok (Apify) — `src/collectors/`.
2. **Score** — `views do post ÷ média histórica do perfil` — `src/score.ts`,
   `src/pipeline.ts`. Não é ranking por views absolutas: um canal pequeno
   que estourou pontua mais que um canal grande em dia normal.
3. **Transcrição + análise leve** — legenda automática do YouTube ou
   Whisper (Groq) para os demais; a rotina cloud escreve gancho/estrutura/
   ângulo direto, sem custo extra de API — `src/transcribe.ts`.
4. **Publicação** — hoje é um passo manual (veja abaixo); a razão está em
   `docs/superpowers/specs/2026-09-11-mineracao-referencias-design.md`.
5. **Painel** — `panel/dashboard.html`, três abas: Novos, Fila, Perfis.

## Configuração (uma vez)

Copie `.env.example` para `.env` e preencha:

- `YOUTUBE_API_KEY` — [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → ativa "YouTube Data API v3" → cria uma API key. Grátis, cota generosa.
- `META_ACCESS_TOKEN` — já existe em `Documents/Ads Automation/.env` (mesma conta da Dra. Amanda), pode reaproveitar ou gerar um token próprio no [Meta for Developers](https://developers.facebook.com/).
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` — rode `node -e "..."` chamando `resolveOwnBusinessAccountId` de `src/collectors/instagram.ts` com o `META_ACCESS_TOKEN`, ou pegue direto no Graph API Explorer (`/me/accounts` → id da Page → `instagram_business_account`).
- `APIFY_TOKEN` — crie conta grátis em [apify.com](https://apify.com) (US$5/mês de crédito, sem cartão), token em Settings → Integrations.
- `GROQ_API_KEY` — conta grátis em [console.groq.com](https://console.groq.com), free tier cobre a transcrição.

Teste local antes de confiar na rotina:

```bash
npm install
npm test          # 60+ testes unitários, não tocam em API real
npm run daily-run  # roda de verdade, escreve daily-run-output.json
```

## Rodando a coleta diária sozinha

Configurada como uma rotina agendada na nuvem (`schedule` skill /
RemoteTrigger), repositório
[`empresariamento/mineracao-referencias`](https://github.com/empresariamento/mineracao-referencias)
(público — sem segredos no código, as chaves ficam nas variáveis de
ambiente da rotina, nunca commitadas). O prompt exato está em
`routines/daily-mining.md`.

**Publicação no painel ainda é manual** — peça "publica as minerações" numa
conversa com o Claude (30 segundos), porque a rotina automática trava numa
aprovação de permissão que ninguém está lá pra dar (ver a seção "Achados"
no spec). O `.claude/settings.json` deste repo libera `Bash`/`Read`/`Write`
pra rotina rodar sem travar nos passos que ela de fato automatiza.

## Limitações conhecidas

- **Instagram não expõe views de terceiros** — o Graph API's
  `business_discovery` só devolve likes/comentários pra contas que não são
  a sua. `views` do Instagram é, na prática, uma proxy via likes.
- **Instagram não tem busca de "viral do nicho"** — só funciona pra
  usernames que você já conhece. A cobertura de virais fora do banco fixo
  é YouTube + TikTok.
- **TikTok depende de um ator do Apify** (`clockworks/tiktok-scraper`) —
  confirme que ele ainda existe e que os nomes de campo do dataset
  (`playCount`, `webVideoUrl`, etc.) não mudaram antes de confiar numa
  semana inteira de coleta.
- **Os handles em `data/profiles.json` são meu melhor palpite**, não
  verificados um por um — confirme e corrija na aba Perfis do painel
  (marque "confirmado" conforme for validando).
- **Publicação automática no painel está bloqueada** por uma permissão do
  Claude Code que não encontrei como pré-aprovar para sessões sem
  ninguém presente — ver spec para os detalhes da investigação.
