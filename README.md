# paude-pi-extension

**Paude** environment awareness for [Pi](https://github.com/earendil-works/pi): teaches the agent about container constraints and commit discipline for harvest.

**Conditional activation** — the extension checks for `PAUDE_SUPPRESS_PROMPTS=1` (set automatically inside every Paude container). When Pi runs outside Paude, the extension does nothing. Safe to install globally.

**Default loading** — add this extension to your paude user defaults to load it in every session:

```bash
paude defaults set pi-extensions "['git:https://github.com/hhellbusch/paude-pi-extension.git']"
```

Or create `~/.config/paude/defaults.json`:

```json
{
  "defaults": {
    "pi-extensions": ["git:https://github.com/hhellbusch/paude-pi-extension.git"]
  }
}
```

**Opt-out** — this extension provides essential environment awareness (container constraints, push capability, workspace customization detection). If you want to disable it for a single session, use:

```bash
paude create --agent pi --no-pi-extensions <name>
```

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
| Network — paude-proxy | Egress flows through paude-proxy at `10.89.0.2:3128` via `https_proxy`; domains are allowlisted — non-whitelisted hosts return `403 Forbidden` at the CONNECT layer; operator manages the allowlist; work around blocked domains by asking the operator |

## What ships

| Path | Role |
|------|------|
| `extensions/paude-l0.ts` | `before_agent_start` hook — conditional L0 injection |

Pattern matches [pi-caveman-mode](https://github.com/habitssss/pi-caveman-mode) and [zanshin-pi-extension](https://github.com/hhellbusch/zanshin-pi-extension): `package.json` field `pi.extensions` → `./extensions`.

## License

MIT
