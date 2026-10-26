# ⚖️ Roast Court

Two AI lawyers debate any topic in an animated courtroom. They rebut, roast each other and react; a biased gallery cheers,
boos and throws tomatoes; Judge Athena rules on every count; and a referee fact-checks every claim so you walk away having
actually learned something (there's a case brief and a quiz at the end).

## Run it

```bash
yarn install
yarn dev:mock   # offline: a scripted mock instead of Gemini, no API key needed
yarn dev        # live: needs GEMINI_API_KEY (or GOOGLE_API_KEY) in .env
```

Open <http://localhost:5180>. The API/socket server runs on <http://localhost:4310>.

`yarn test` runs the server test suite; `yarn typecheck` checks all three workspaces; `yarn build && yarn start`
serves the built app from the server alone.

## How it fits together

```
web/     React 19 + Vite + Tailwind 4 + Motion: the courtroom stage, puppets, gallery, HUD, sound and voices
server/  Express 5 + Socket.IO + LangGraph trial engine + SQLite (better-sqlite3)
shared/  zod schemas for every event and DTO, used by both sides
```

- **The trial** (`server/src/graph/graph.ts`) is a LangGraph state machine:
  `frame_case → (debater_turn ⇄ courtroom_reaction)… → announce_count → rule_count → … → announce_closing → deliberate → case_brief`.
- **Every step is an event** (`server/src/runtime/eventStore.ts`) with a deterministic key, stored in SQLite. Re-running a step
  after a crash reuses its stored output, so nothing is generated twice. LangGraph checkpoints let an interrupted trial resume.
- **Pacing:** the browser acks each event once it has played it, and the server stays at most one beat ahead
  (`server/src/runtime/pacer.ts`). Nobody watching means no API calls.
- **Resilience:** retries with back-off, model fallback, JSON repair, a rate limiter (`server/src/llm/`) and on-screen
  "court recess" breaks when Gemini is overloaded. The case adjourns, with a Resume button, only when it truly can't continue.
- **The show** (`web/src/director/director.ts`) turns events into beats: camera cut, expressions, gesture, voice with lip-sync,
  the victim's reaction close-up, the crowd's reaction per faction, the fact-check stamp.

## Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | (none) | required for live mode |
| `LLM_MODELS_MAIN` | `gemini-3.8-flash,gemini-3.5-flash-lite,gemini-2.5-flash` | lawyers and judge, first one preferred |
| `LLM_MODELS_LITE` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite` | referee/crowd |
| `LLM_RPM` | `8` | client-side request rate limit |
| `GEMINI_TTS` | on when a key is set | `off` disables the expressive Gemini voices option |
| `TTS_MODEL` | `gemini-3.8-flash-lite-tts` | |
| `GROUNDING` | `off` | `on` grounds the case brief with Google Search sources |
| `PORT` | `4310` | |

## Sound

Every sound is synthesized in the browser, so no audio files are needed. To use real recordings, see
`web/public/audio/CREDITS.md`.
