# Sistema de Mineração de Referências — Design

**Data:** 2026-09-11
**Status:** implementado, com dois desvios do design original (ver Adendo)

## Adendo (2026-09-11, durante a implementação)

Dois pontos do design original mudaram depois de testes reais contra a
infraestrutura de agentes agendados:

1. **Cadência: diária, não semanal.** O usuário pediu a mudança depois da
   aprovação inicial. Impacto: janela de comparação do score passou de 7
   para 1 dia (`RECENT_WINDOW_DAYS` em `src/pipeline.ts`), o corte de itens
   por rodada caiu de 25 para 15, e todo nome de arquivo/variável/coleção
   que dizia "weekly" virou "daily"/"run".

2. **Publicação no painel não é automática.** Testei a rotina agendada na
   nuvem publicando de verdade num Artifact: ela roda a sessão Claude Code,
   clona o repositório, e consegue **publicar** um Artifact sem travar. Mas
   a chamada que **grava dados** nele (`write_db` — essencial pro pipeline
   salvar os resultados) sempre dispara um prompt de permissão do Claude
   Code, mesmo com um `.claude/settings.json` no repositório liberando a
   ferramenta `Artifact` inteira via `permissions.allow`. Numa rotina sem
   ninguém presente pra aprovar, ela trava para sempre em
   `requires_action` — confirmado em três tentativas, incluindo uma com o
   repositório e o allowlist corretos. Não encontrei a string de permissão
   granular certa (algo como `Artifact(write_db)`) porque investigá-la
   exigia mexer em configuração de permissões, e o modo operacional da
   sessão que fazia essa investigação bloqueou essa ação por política.
   **Solução adotada:** a rotina diária roda sozinha até o fim (coleta,
   score, transcrição, análise) e commita um JSON em
   `data/runs/<data>.json` no próprio repositório — sem tocar no Artifact.
   Publicar esse JSON no painel passou a ser um pedido de ~30s numa
   conversa normal com o Claude ("publica as minerações"), onde os
   prompts de permissão resolvem na hora porque há alguém ali para
   responder. Ver `routines/daily-mining.md` para o prompt exato dos dois
   fluxos. Fica como pendência futura destravar a publicação 100%
   automática, caso a string de permissão certa seja encontrada.

## Contexto e objetivo

O usuário produz conteúdo de mercado digital (marketing, tráfego, infoproduto,
negócio online) no Brasil e quer um banco fixo de referências de criadores
gringos com muita escala, revisado toda semana, para modelar pautas e ter
previsibilidade de produção — em paralelo aos conteúdos autorais que ele
cria do zero.

O sistema deve:
- Minerar automaticamente um conjunto fixo de ~15 perfis gringos de
  marketing/negócio online (YouTube, Instagram, TikTok), mais buscas por
  virais do nicho fora desse conjunto fixo.
- Rodar sozinho, agendado na nuvem, sem depender do PC do usuário ligado.
- Rankear por estouro relativo ao histórico de cada perfil, não por views
  absolutas — para não ignorar canais menores com sinal forte.
- Entregar uma triagem semanal rápida (~5 min) num painel web.
- Manter uma fila de produção com estado (aprovado → roteiro pronto →
  gravado) para dar visibilidade de "quantas pautas tenho em estoque".
- Gerar roteiro adaptado ao Brasil sob demanda, só para os itens aprovados.
- Custo de operação: R$ 0/mês (usar apenas tiers gratuitos).

## Não-objetivos (fora do escopo desta v1)

- Aprendizado automático do gosto do usuário a partir do histórico de
  escolhas (v2 — precisa de meses de dados de uso antes de fazer sentido).
- Geração de roteiro para todos os itens coletados (só sob demanda, por
  item aprovado).
- Publicação ou agendamento do conteúdo gravado — o sistema para na
  entrega do roteiro.
- Suporte a outro nicho (saúde/fertilidade) — mencionado na conversa mas
  descartado; só mercado digital nesta versão.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Agente agendado (cloud, segunda-feira de manhã)             │
│                                                                │
│  1. Coleta  → YouTube API, Meta Graph (business_discovery),  │
│               Apify (TikTok, IG fallback)                    │
│  2. Score   → estouro relativo à média do perfil (90 dias)   │
│  3. Análise → transcrição (Whisper/Groq) + gancho/estrutura  │
│               via LLM, só para o top ~25                     │
│  4. Persist → grava no banco do Artifact (write_db)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Painel (Artifact publicado, capability: db)                 │
│                                                                │
│  Aba Semana → itens novos da semana, ordenados por estouro   │
│  Aba Fila   → aprovados, com estado da produção              │
│  Aba Perfis → banco de 15 fixos + sugestões pendentes        │
│                                                                │
│  Ação "gerar roteiro" → dispara análise nível 4 sob demanda  │
└─────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. Coletor multi-plataforma

Um módulo por fonte, com uma interface comum de saída (lista de posts
normalizados: perfil, plataforma, url, data, views/likes, legenda, thumb).

- **YouTube** — YouTube Data API v3 (gratuita, chave própria). Busca vídeos
  recentes dos canais fixos + busca por termos do nicho ordenada por
  relevância/data para pegar virais fora do banco fixo.
- **Instagram** — Meta Graph API, campo `business_discovery`, usando as
  credenciais já existentes em `Documents/Ads Automation/.env`. Cobre
  contas Business/Creator, que é o padrão de criadores grandes. Testar
  primeiro se o modo dev do app permite; se não, fallback abaixo.
- **TikTok** — Apify (ator de scraping de perfil), tier gratuito
  (US$5/mês de crédito). Cobre também o fallback de Instagram se o Graph
  API não servir.

Cada coletor roda de forma independente e tolerante a falha — se uma
fonte falhar numa semana, as outras seguem normalmente e o item fica
registrado como "fonte indisponível" em vez de quebrar o pipeline.

### 2. Motor de score

Puramente aritmético, sem custo de IA:

```
score = views_do_post / média_views_dos_últimos_N_posts_do_perfil
```

- N = últimos 90 dias de posts daquele perfil (mínimo 5 posts de
  histórico; perfil novo sem histórico suficiente entra sem score
  comparativo, sinalizado como "perfil novo").
- Itens de busca por viral do nicho (fora do banco fixo) são comparados
  contra uma média de referência do nicho, não do perfil individual.
- Corta para os ~25 melhores da semana somados de todas as fontes antes
  de passar para análise (nível 3).

### 3. Módulo de análise (nível 3 — automático, só top ~25)

- Transcrição: YouTube usa legenda automática nativa (grátis); Reels/TikTok
  usam Whisper via Groq API (free tier).
- LLM extrai: gancho dos primeiros 3s, estrutura do vídeo, ângulo/tese
  central, e uma hipótese de por que funcionou.
- Resultado grava no card do painel — é o que permite bater o olho sem
  assistir tudo.

### 4. Gerador de roteiro (nível 4 — sob demanda, só itens aprovados)

- Disparado pelo botão "gerar roteiro" no painel.
- Usa a análise do nível 3 como insumo e adapta gancho/estrutura/ângulo
  para o mercado brasileiro, na voz do usuário (referência: conteúdo
  autoral prévio, se disponível).
- Roteiro grava no próprio card, e o estado avança para "roteiro pronto".

### 5. Painel (Artifact + capability `db`)

Três abas:

- **Semana** — itens da coleta mais recente, ordenados por score
  decrescente, com thumb, plataforma, métrica de estouro, gancho
  resumido, link para assistir, e botão "aprovar" / "descartar".
- **Fila** — itens aprovados, cartão por item, com estado (`aprovado` →
  `roteiro pronto` → `gravado`) e botão de avançar estado / gerar
  roteiro / marcar gravado. Contagem visível de "pautas em estoque".
- **Perfis** — os ~15 fixos (editável: adicionar/remover manualmente) e
  uma lista de "sugestões" — perfis que apareceram repetidamente nos
  resultados de busca por viral do nicho sem estar no banco fixo — com
  botão para promover a fixo.

Estado persistido via `write_db`/`read_db` do Artifact (coleções:
`weekly_items`, `queue`, `profiles`, `suggestions`).

### 6. Agendamento

Agente cloud agendado (skill `schedule`) toda segunda-feira de manhã,
horário de Brasília. Roda o pipeline completo (coleta → score → análise)
e grava direto no banco do Artifact publicado. Falha de uma execução não
afeta a anterior — o painel sempre mostra a última coleta bem-sucedida.

## Fluxo de dados

1. Segunda de manhã: agente dispara coleta nas 3 fontes para os perfis
   fixos + busca por termos do nicho.
2. Score calculado, top ~25 selecionados.
3. Transcrição + análise leve rodam nesses ~25.
4. Tudo grava em `weekly_items` no banco do Artifact (substitui a semana
   anterior, ou acumula com campo de semana — a decidir no plano).
5. Usuário abre o painel, aba Semana, aprova os que quer.
6. Aprovados migram (ou são referenciados) em `queue`.
7. Usuário clica "gerar roteiro" em itens da fila quando for gravar.
8. Usuário marca "gravado" ao terminar — fecha o ciclo.

## Tratamento de erro

- Fonte de coleta fora do ar → pula essa fonte, loga no painel (aba
  Semana mostra aviso "TikTok indisponível esta semana"), resto do
  pipeline segue.
- Perfil sem posts suficientes para score relativo → entra na lista sem
  ranking, marcado como "perfil novo — sem histórico".
- Cota do Apify/Groq estourada → pipeline degrada (pula transcrição ou
  pula a fonte que depende daquela cota) em vez de falhar tudo.
- Falha total do agendamento numa semana → painel mantém a última coleta
  válida; usuário não fica sem nada para revisar.

## Testes

- Testes unitários do motor de score (casos: perfil com histórico normal,
  perfil novo, perfil com posts virais discrepantes).
- Teste de integração de cada coletor contra dados reais de 1-2 perfis
  antes de rodar com os 15 completos (evita estourar cota em erro de
  configuração).
- Teste manual do painel: aprovar item, gerar roteiro, avançar estado,
  promover sugestão de perfil.

## Decisões em aberto para o plano de implementação

- Lista inicial dos ~15 perfis fixos — usuário aprova antes do primeiro
  run real.
- Formato exato da chave de semana em `weekly_items` (data ISO da
  segunda-feira).
- Limite de itens por fonte na coleta bruta (antes do corte de score)
  para não estourar cota em semanas com muito volume.
