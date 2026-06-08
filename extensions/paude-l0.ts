import {
  readdirSync,
  existsSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));

function insidePaude(): boolean {
  return process.env.PAUDE_SUPPRESS_PROMPTS === "1";
}

function discoverAllowlist(): string | null {
  const source = "/dev/shm/paude-proxy/allowlist.txt";
  if (!existsSync(source)) return null;

  try {
    const cacheDir = "/home/paude/.paude-proxy";
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
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

  for (const dir of [".agents/skills", ".cursor/skills"]) {
    const fullPath = join(workspace, dir);
    if (existsSync(fullPath)) {
      try {
        const entries = readdirSync(fullPath);
        const skills = entries.filter((f) =>
          existsSync(join(fullPath, f, "SKILL.md")),
        );
        if (skills.length > 0) {
          customizations.push(
            `${dir}: ${skills.map((s) => `/${s}`).join(", ")}`,
          );
        }
      } catch {
        /* skip */
      }
    }
  }

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
    /* skip */
  }

  const promptsDir = join(workspace, ".prompts");
  try {
    if (existsSync(promptsDir)) {
      const prompts = readdirSync(promptsDir).filter((f) =>
        f.endsWith(".md"),
      );
      if (prompts.length > 0) {
        customizations.push(
          `.prompts: ${prompts.length} prompt(s) available`,
        );
      }
    }
  } catch {
    /* skip */
  }

  return customizations.join(" | ");
}

/**
 * Tight L0 — core container awareness + progressive loading paths.
 * Full details live in referenced docs; the agent reads them on demand.
 */
function buildPaudeL0(): string {
  const customizations = detectWorkspaceCustomizations();
  const allowlist = discoverAllowlist();

  const parts: string[] = [
    "## Paude Environment (extension — container awareness)",
    "",
    "You are running inside a **Paude container** at `/pvc/workspace/`. Your work is isolated from the host.",
    "",
    "**Commit discipline:** Always commit your changes. The operator pulls your work via `paude harvest` — uncommitted changes are invisible. If the task prompt includes a commit instruction, follow it exactly. If not, commit with a descriptive message when done.",
    "",
    "**Push capability:** The paude-proxy injects credentials at connect time, so you can `git push` to remotes if needed. This is no longer a harvest-only workflow.",
    "",
    "**paude-proxy (MITM credential broker):** Egress routes through paude-proxy — you **never see real credentials**. The proxy injects API keys into request headers based on destination domain. For full details on credential types, token vending, and configuration: `devops/paude-proxy/README.md`.",
    "",
    "**Network — paude-proxy:** Domain allowlist enforced. For troubleshooting (curl testing, git credentials, token reconnection): `devops/paude-proxy/README.md`.",
    "",
    "**Available agents in Paude:**",
    "",
    "- **Pi** (current) — coding focus, TypeScript extensions, rich tool API. Use for active coding tasks.",
    "- **OpenClaw** — autonomous scheduling (heartbeat + cron), persistent memory (MEMORY.md + memory_search), web gateway, multi-channel delivery. Use `paude create --agent openclaw` from the host. Ideal for scheduled monitoring and background work.",
    "- **Hermes Agent** — self-improving with built-in learning loop, built-in cron, model-agnostic (200+ via OpenRouter, 300+ via Nous Portal). NOT yet in Paude.",
    "",
    "When a task requires autonomous scheduling, persistent memory, or background monitoring, consider OpenClaw (via Paude) may be the right platform.",
  ];

  if (allowlist) {
    parts.push(
      "",
      `**Network allowlist:** cached at ${allowlist} — read it when you need network access to non-obvious domains.`,
    );
  }

  if (customizations) {
    parts.push(
      "",
      `**Workspace as customization source:** This workspace carries its own agent context. When present, treat these as your system context (not suggestions):\n- ${customizations}`,
    );
  }

  parts.push(
    "",
    "These customizations are the workspace's own agent configuration — skills, rules, prompts, and other tools. They are the source of truth for this workspace's agent behavior, not `~/.pi/` or any global config.",
    "",
    "**Do not** attempt to escape the container or modify system-level config. Work within `/pvc/workspace/` and commit your results.",
    "",
    "**Pi extension development:** When modifying a Pi extension, run `npm test` in the extension directory before pushing. Full workflow: `submodules/zanshin-pi-extension/docs/PI-EXT-DEV.md`.",
  );

  return parts.join("\n");
}

function installGitHooks(): void {
  const hooksDir = "/home/paude/.git-hooks";
  const hookSrc = join(__dirname, "prepare-commit-msg");
  const hookDst = join(hooksDir, "prepare-commit-msg");

  if (!existsSync(hookSrc)) return;
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  copyFileSync(hookSrc, hookDst);
  chmodSync(hookDst, 0o755);
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (!insidePaude()) return {};

    try {
      installGitHooks();
      pi.exec("git", [
        "config",
        "--global",
        "core.hooksPath",
        "/home/paude/.git-hooks",
      ]);
    } catch {
      /* hook installation is best-effort */
    }

    try {
      const exec = (
        cmd: string,
        args: string[],
      ): Promise<{ stdout: string; stderr: string }> => pi.exec(cmd, args);

      const nameResult = await exec("git", ["config", "--get", "user.name"]);
      const emailResult = await exec("git", ["config", "--get", "user.email"]);
      const currentName = nameResult.stdout.trim();
      const currentEmail = emailResult.stdout.trim();

      if (
        !currentName ||
        ["paude", "root", "container"].includes(currentName)
      ) {
        await exec("git", ["config", "user.name", "pi.dev (zanshin)"]);
      }
      if (
        !currentEmail ||
        !currentEmail.includes("@") ||
        ["paude@container", "root@localhost"].includes(currentEmail)
      ) {
        await exec(
          "git",
          ["config", "user.email", "pi-dev+zanshin@workspace.local"],
        );
      }
    } catch {
      /* git config setup is best-effort */
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPaudeL0()}`,
    };
  });
}
