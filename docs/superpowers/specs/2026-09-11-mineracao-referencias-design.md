# Sistema de Mineração de Referências — Design

**Data:** 2026-09-11
**Status:** aprovado para implementação

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
