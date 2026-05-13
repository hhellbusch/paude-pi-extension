import { readFileSync, readdirSync, existsSync, copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));

function insidePaude(): boolean {
	return process.env.PAUDE_SUPPRESS_PROMPTS === "1";
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

	return `
## Paude Environment (extension — container awareness)

You are running inside a **Paude container** at \`/pvc/workspace/\`. Your work is isolated from the host.

**Commit discipline:** Always commit your changes. The operator pulls your work via \`paude harvest\` — uncommitted changes are invisible. If the task prompt includes a commit instruction, follow it exactly. If not, commit with a descriptive message when done.

**Push capability:** The paude-proxy injects credentials at container start, so you can \`git push\` to remotes if needed. This is no longer a harvest-only workflow — you can push directly when appropriate.

**Network:** Egress is proxy-filtered to an allowlist. If a domain is unreachable, work around it — do not retry indefinitely.

**Workspace as customization source:** This workspace carries its own agent context. When present, treat these as your system context (not suggestions):
${customizations ? "\n- " + customizations : "\n- (no workspace customizations detected — standard behavior applies)"}

These customizations are the workspace's own agent configuration — skills, rules, prompts, and other tools. They are the source of truth for this workspace's agent behavior, not \`~/.pi/\` or any global config.

**Do not** attempt to escape the container or modify system-level config. Work within \`/pvc/workspace/\` and commit your results.`.trim();
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
			ctx.exec("git", ["config", "--global", "core.hooksPath", "/home/paude/.git-hooks"], {
				rejectOnError: false,
			});
		} catch {
			// Hook installation is best-effort — if it fails, agent still works
		}

		// Configure git authorship so commits show the agent as author,
		// not the container user or host user.
		// Read existing values to avoid overwriting user's global config.
		try {
			const exec = (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
				ctx.exec(cmd, args, { rejectOnError: false });

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
