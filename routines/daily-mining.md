# Daily mining routine — prompt reference

This is the reference copy of the prompt used by the scheduled cloud
routine. It's kept here so the prompt lives with the code it drives; the
actual routine is configured via the `schedule` skill / RemoteTrigger API
with this text as its `events[].data.message.content`.

## Why this routine doesn't touch the Artifact panel directly

An earlier version of this routine tried to publish straight into the
published panel's database (the Artifact tool's `write_db`). That call
triggers a permission prompt that nobody is present to answer in an
unattended run, and the run gets stuck forever (`requires_action`).
Pre-approving the bare `Artifact` tool name in `.claude/settings.json`
does not cover that specific action. Until that's resolved, the routine
stops at committing a JSON file to this repo — a human (you, or Claude in
an interactive session) publishes it to the panel from there. See
`docs/superpowers/specs/2026-09-11-mineracao-referencias-design.md` for
the full history of this finding.

## Prompt

```
You are running the daily reference-mining pipeline for this repo. Do the
following, in order, and do not ask for confirmation at any step — this is
an unattended scheduled run.

1. Run `npm install` if node_modules is missing, then run
   `npm run daily-run`. This reads data/profiles.json, hits the YouTube,
   Instagram and TikTok collectors, scores everything, and writes
   `daily-run-output.json` in the repo root.
   - If the command fails outright (e.g. every source errored), stop,
     commit nothing, and report the failure.

2. Read `daily-run-output.json`. It has: `runDate` (ISO date), `items`
   (array of scored+transcribed posts), `sourceErrors`, `suggestedProfiles`.

3. For each item in `items`, read its `caption` and `transcript` (when
   present) and write four short fields directly into that item object:
   - `hook`: the hook/opening line or visual, in 1 sentence
   - `structure`: the video's structure/format in 1 sentence
   - `angle`: the core angle or thesis in 1 sentence
   - `whyItWorked`: your hypothesis for why it performed, in 1-2 sentences
   Skip this for an item whose transcriptSource is "unavailable" and whose
   caption is also empty — just leave those four fields out for it.

4. Write the enriched result to `data/runs/<runDate>.json` (pretty-printed
   JSON, the same object with the enriched items).

5. Commit ONLY that new file (`git add data/runs/<runDate>.json`) with
   message `data: mining run <runDate>` and push to the default branch.
   Do not touch any other file, do not open a PR.

6. Report a short plain-text summary: how many items were mined, how many
   scored vs. unranked, any sourceErrors, and how many new suggestions were
   found in `suggestedProfiles` (list them by handle).
```

## Publishing a run to the panel (manual step, for now)

When you (Renan) want the panel updated, open a session with Claude and
say something like "publica as minerações novas" — Claude will:

1. `git pull` this repo, list `data/runs/*.json` files newer than what's
   already in the panel's `runs` collection (check via the Artifact tool's
   `read_db`, `list`, collection `runs` — doc ids are the ISO dates).
2. For each new file, `write_db` `set` into collection `runs`, doc id =
   that date, with the file's contents.
3. If it's the very first publish ever, also publish `panel/dashboard.html`
   and batch-write `data/profiles.json` into the `profiles` collection.
4. Report the panel URL and how many new days got published.

This is a normal interactive session, so the Artifact permission prompts
resolve immediately — no stuck `requires_action` state.
