# paude-pi-extension

**Paude** environment awareness for [Pi](https://github.com/badlogic/pi-mono): teaches the agent about container constraints and commit discipline for harvest.

**Conditional activation** — the extension checks for `PAUDE_SUPPRESS_PROMPTS=1` (set automatically inside every Paude container). When Pi runs outside Paude, the extension does nothing. Safe to install globally.

## Install

```bash
pi install git:git@github.com:hhellbusch/paude-pi-extension.git
```

Or HTTPS:

```bash
pi install git:https://github.com/hhellbusch/paude-pi-extension.git
```

**Pin a commit** (recommended):

```bash
pi install git:https://github.com/hhellbusch/paude-pi-extension.git#<40-char-sha>
```

## What gets injected

When running inside a Paude container, a compact block is appended to the system prompt covering:

| Concern | What Pi learns |
|---------|---------------|
| Environment | Running at `/pvc/workspace/` inside an isolated container; operator harvests commits |
| Commit discipline | Always commit before finishing — `paude harvest` only sees committed work |
| Network | Egress is proxy-filtered; no `git push`; work around unreachable domains |

## What ships

| Path | Role |
|------|------|
| `extensions/paude-l0.ts` | `before_agent_start` hook — conditional L0 injection |

Pattern matches [pi-caveman-mode](https://github.com/habitssss/pi-caveman-mode) and [zanshin-pi-extension](https://github.com/hhellbusch/zanshin-pi-extension): `package.json` field `pi.extensions` → `./extensions`.

## License

MIT
