# Agent Platform Prep · 6 weeks

A small local app for daily preparation for a **Principal Engineer (agent framework)** role.
It is written for an experienced engineer who has not built an AI app or agent yet.

- **Today view:** works out which of the 42 days you're on, with step-by-step tasks, copy-paste code, and ready-made prompts for Claude Code.
- **In-app video player:** curated talks (Karpathy, Anthropic's agents, MCP and Claude Code talks) play inside the app.
- **Progress saved locally:** ticks, daily notes, interview answers and your streak go to `data/progress.json` (gitignored), with a browser copy as backup.
- **Project tab:** a guided build of `agent-platform-lab`, a mini agent platform with stated guarantees (durable jobs, idempotency, capability-scoped tools, sandboxing, injection defenses, traces, MCP, evals in CI).
- **Interview prep:** 20 practice questions with answer outlines.

No dependencies. Only Node.js 18+ is needed.

## Run it

```bash
cd ~/git/ai-agent-prep
./start.command        # or: npm start
```

This opens http://localhost:4321. You can also double-click `start.command` in Finder. If macOS blocks it the first time, right-click it and choose **Open**.

Stop the app with Ctrl+C in the terminal. Your progress is already saved.

## Back up your progress

Go to Settings → Export backup to download a JSON file. Import it the same way on another machine.

## Tests

```bash
npm test                                   # server API + curriculum validation
# Browser test (optional, needs: pip install playwright && playwright install chromium)
PORT=4399 PREP_DATA_DIR=/tmp/prep node server.js &
python3 test/e2e.py http://localhost:4399 /tmp/prep
```

## Customize

Everything you study lives in `public/data.js`: days, tasks, videos, interview questions and links.
Keep task `id`s stable once you've started, because progress is stored by id.
