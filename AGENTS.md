# AGENTS.md

Operating notes for AI coding agents (Claude Code, Codex, Cursor, Copilot and others) working in this repository. Everything here is derived from the files actually in the tree, so trust it over guesses, and update it when the facts change.

## What this repository is

Car listing aggregator across 10 sources, priced against real sold comps

- Source: https://github.com/nirholas/carbide
- Primary language: JavaScript

## Repository layout

- `data/`
- `public/`
- `research/`
- `scraper/`
- `README.md`
- `package.json`

## Setup

```bash
npm install
```

## Commands

| Task | Command |
|---|---|
| start | `npm start` |
| build | `npm run build` |

Run the test and lint commands above before you consider a change finished. If a command fails on code you did not touch, say so in your report instead of silently skipping it.

## Conventions

- `.env` files are gitignored; never commit credentials, and read configuration from environment variables.
- Commit messages follow Conventional Commits (`type(scope): summary`), matching the existing history.
- Read the surrounding code before adding to it, and match its naming, file organisation and error-handling style.
- Keep `README.md` accurate: if a change alters behaviour, commands or configuration, update the docs in the same commit.
- Do not leave TODO comments, stub functions, placeholder data or commented-out code behind. Finish what you start or leave it out.
- Small, focused commits with a subject line that describes the change, not the act of committing.

## Where to raise things

- Bugs and feature requests: https://github.com/nirholas/carbide/issues
- Questions and ideas: https://github.com/nirholas/carbide/discussions
- Security issues: report privately at https://github.com/nirholas/carbide/security/advisories/new, never in a public issue.
