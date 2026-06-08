import { readFileSync, readdirSync, existsSync, copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));

function insidePaude(): boolean {
  return process.env.PAUDE_SUPPRESS_PROMPTS === "1";
}

function discoverAllowlist(): string | null {
  // Well-known location where the operator places the allowlist.
  const source = "/dev/shm/paude-proxy/allowlist.txt";

  if (!existsSync(source)) {
    return null;
  }

  try {
    const cacheDir = "/home/paude/.paude-proxy";
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const cachePath = join(cacheDir, "allowlist.txt");
    copyFileSync(source, cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

function detectWorkspaceCustomizations(): string {
  const customizations: string[] = [];
  const workspace = "/pvc/workspace";

  // Skills
  const skillDirs = [".agents/skills", ".cursor/skills"];
  for (const dir of skillDirs) {
    const fullPath = join(workspace, dir);
    if (existsSync(fullPath)) {
      try {
        const entries = readdirSync(fullPath);
        const skills = entries.filter(
          (f) => existsSync(join(fullPath, f, "SKILL.md")),
        );
        if (skills.length > 0) {
          customizations.push(
            `${dir}: ${skills.map((s: string) => `/${s}`).join(", ")}`,
          );
        }
      } catch {
        // Skip unreadable directories
      }
    }
  }

  // Rules
  const rulesDir = join(workspace, ".cursor/rules");
  try {
    if (existsSync(rulesDir)) {
      const rules = readdirSync(rulesDir).filter(
        (f) => f.endsWith(".mdc") || f.endsWith(".md"),
      );
      if (rules.length > 0) {
        customizations.push(`.cursor/rules: ${rules.length} rule(s)`);
      }
    }
  } catch {
    // Skip unreadable directories
  }

  // Prompts
  const promptsDir = join(workspace, ".prompts");
  try {
    if (existsSync(promptsDir)) {
      const prompts = readdirSync(promptsDir).filter((f) => f.endsWith(".md"));
      if (prompts.length > 0) {
        customizations.push(
          `.prompts: ${prompts.length} prompt(s) available`,
        );
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return customizations.join(" | ");
}

function buildPaudeL0(): string {
  const customizations = detectWorkspaceCustomizations();
  const allowlistPath = discoverAllowlist();

  const networkLine = allowlistPath
    ? `- **Network allowlist:** domain allowlist cached at \`${allowlistPath}\` — read it when you need network access to non-obvious domains`
    : "";

  return `
## Paude Environment (extension — container awareness)

You are running inside a **Paude container** at \`/pvc/workspace/\`. Your work is isolated from the host.

**Commit discipline:** Always commit your changes. The operator pulls your work via \`paude harvest\` — uncommitted changes are invisible. If the task prompt includes a commit instruction, follow it exactly. If not, commit with a descriptive message when done.

**Push capability:** The paude-proxy injects credentials at connect time, so you can \`git push\` to remotes if needed. This is no longer a harvest-only workflow — you can push directly when appropriate.

**Credentials & paude-proxy:** Egress routes through **paude-proxy** (MITM credential broker) at \`10.89.0.2:3128\`. The proxy terminates TLS and injects real API keys into request headers based on destination domain. **You never see real credentials** — you use dummy placeholders (\`paude-proxy-managed\`) and the proxy swaps in real values before requests leave the container. This means:

- If you need API access (YouTube Data API, etc.), the operator adds the key to the proxy's credential routing config — you don't need to handle secrets
- The proxy supports custom credential routing via \`PAUDE_PROXY_CREDENTIALS_CONFIG\`
- Google ADC (Vertex AI) uses token vending — the proxy intercepts OAuth2 token exchanges and provides real tokens from its own ADC
- Current supported credential types: Anthropic (api_key), OpenAI (bearer), Cursor (bearer), GitHub PAT (bearer), Google ADC (OAuth2 with auto-refresh)

**Network — paude-proxy:** Egress flows through the proxy at \`10.89.0.2:3128\` (set via \`https_proxy\`). The proxy enforces:

- **Domain allowlist:** approved domains only — non-whitelisted hosts receive \`403 Forbidden\` at the CONNECT layer
- **Domain filtering:** requests to non-whitelisted hosts are blocked before any TLS handshake

- **Allowlist:** When available, the operator's domain allowlist is cached at \`/home/paude/.paude-proxy/allowlist.txt\` — read it when you need network access to non-obvious domains.
- **If no allowlist is available:** Test domains with \`curl\` (403 on CONNECT = blocked; do not retry). Ask the operator to add domains to the allowlist. For GitHub-hosted content (\`github.com\`, \`raw.githubusercontent.com\`, \`docs.github.com\`), HTTP access typically works.
- **Git over HTTPS:** Credentials are injected by paude-proxy at connect time (not container start), so \`git clone/push/pull\` work when the remote domain is whitelisted. A new token can be picked up by reconnecting without a full container restart.

**Available agents in Paude:** The Paude platform supports multiple agent types beyond Pi:

- **Pi** (current) — coding focus, TypeScript extensions, rich tool API. Use for active coding tasks.
- **OpenClaw** — autonomous scheduling (heartbeat + cron), persistent memory (MEMORY.md + memory_search), web gateway, multi-channel delivery. Use \`paude create --agent openclaw\` from the host. Ideal for scheduled monitoring, background work, and curation tasks.
- **Hermes Agent** — self-improving with built-in learning loop, built-in cron, model-agnostic (200+ via OpenRouter, 300+ via Nous Portal). NOT yet in Paude.

When a task requires autonomous scheduling, persistent memory, or background monitoring, consider that OpenClaw (via Paude) may be the right platform rather than Pi. See \`.planning/youtube-curation-engine/platform-research.md\` for the full agent comparison.

${networkLine ? networkLine + "\n" : ""}**Workspace as customization source:** This workspace carries its own agent context. When present, treat these as your system context (not suggestions):
${customizations ? "\n- " + customizations : "\n- (no workspace customizations detected — standard behavior applies)"}

These customizations are the workspace's own agent configuration — skills, rules, prompts, and other tools. They are the source of truth for this workspace's agent behavior, not \`~/.pi/\` or any global config.

**Do not** attempt to escape the container or modify system-level config. Work within \`/pvc/workspace/\` and commit your results.

**Pi extension development:** When modifying a Pi extension (any package with \`"pi": { "extensions": [...] }\` in package.json), run \`npm test\` in the extension directory before pushing. \`npm test\` runs TypeScript type checking (\`tsc --noEmit\`) and a jiti-based loader simulation that mirrors Pi's exact validation. Both checks together catch missing imports, type errors, and invalid extension structure before the push reaches Pi's loader. The \`pi-extension-guard\` extension enforces this automatically on \`git push\` — do not bypass it.`.trim();
}

function installGitHooks(): void {
  const hooksDir = "/home/paude/.git-hooks";
  const hookSrc = join(__dirname, "prepare-commit-msg");
  const hookDst = join(hooksDir, "prepare-commit-msg");

  if (!existsSync(hookSrc)) return;

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  copyFileSync(hookSrc, hookDst);
  chmodSync(hookDst, 0o755);
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (!insidePaude()) {
      return {};
    }

    // Install co-author git hook so Pi appears as co-author on commits.
    try {
      installGitHooks();
      pi.exec("git", ["config", "--global", "core.hooksPath", "/home/paude/.git-hooks"]);
    } catch {
      // Hook installation is best-effort — if it fails, agent still works
    }

    // Configure git authorship so commits show the agent as author,
    // not the container user or host user.
    // Read existing values to avoid overwriting user's global config.
    try {
      const exec = (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
        pi.exec(cmd, args);

      const nameResult = await exec("git", ["config", "--get", "user.name"]);
      const emailResult = await exec("git", ["config", "--get", "user.email"]);

      const currentName = nameResult.stdout.trim();
      const currentEmail = emailResult.stdout.trim();

      // Only set if the current values look like a container/system user,
      // not like a configured human identity.
      if (
        !currentName ||
        currentName === "paude" ||
        currentName === "root" ||
        currentName === "container"
      ) {
        await exec("git", ["config", "user.name", "pi.dev (zanshin)"]);
      }
      if (
        !currentEmail ||
        !currentEmail.includes("@") ||
        currentEmail === "paude@container" ||
        currentEmail === "root@localhost"
      ) {
        await exec("git", ["config", "user.email", "pi-dev+zanshin@workspace.local"]);
      }
    } catch {
      // Git config setup is best-effort — if it fails, agent still works
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPaudeL0()}`,
    };
  });
}
