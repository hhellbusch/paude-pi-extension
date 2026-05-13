/**
 * pi-extension-guard.ts
 *
 * Before `git push` to a Pi extension repository: runs `npm test` and
 * blocks the push if tests fail.
 *
 * Motivation: Pi extension bugs surface only on `/reload`, after the push
 * has already landed. This guard moves the check to before the push so
 * errors are caught in the same session that introduced them.
 *
 * Detection heuristic — a repo is treated as a Pi extension when its
 * package.json contains both:
 *   - a `"pi"` section with an `"extensions"` array
 *   - a `"scripts"."test"` entry
 *
 * Working directory resolution (in priority order):
 *   1. `git -C <dir> push`         — explicit dir in git command
 *   2. `cd <dir> && ... git push`  — preceding cd in compound command
 *   3. Workspace root              — fallback
 *
 * Activation: only runs inside Paude containers (PAUDE_SUPPRESS_PROMPTS=1).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

function insidePaude(): boolean {
  return process.env.PAUDE_SUPPRESS_PROMPTS === "1";
}

const GIT_PUSH_RE = /\bgit\s+push\b/;

/**
 * Extract the working directory from a bash command.
 * Handles the common patterns seen in Pi agent sessions.
 */
function extractCwd(command: string): string {
  // git -C <dir> push
  const gitCMatch = command.match(/\bgit\s+-C\s+([^\s]+)/);
  if (gitCMatch) return resolve(gitCMatch[1].replace(/^~/, process.env.HOME ?? "~"));

  // cd <dir> && ... git push (take the first cd before git push)
  const cdMatch = command.match(/\bcd\s+([^\s;&|]+)/);
  if (cdMatch) return resolve(cdMatch[1].replace(/^~/, process.env.HOME ?? "~"));

  return process.cwd();
}

/**
 * Read and parse a package.json. Returns null on any error.
 */
function readPackageJson(dir: string): Record<string, unknown> | null {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Return true if this package.json describes a Pi extension with a test script.
 */
function isPiExtensionWithTests(pkg: Record<string, unknown>): boolean {
  const pi = pkg.pi as Record<string, unknown> | undefined;
  const scripts = pkg.scripts as Record<string, unknown> | undefined;
  return (
    Array.isArray(pi?.extensions) &&
    typeof scripts?.test === "string"
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!insidePaude()) return;
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command ?? "";
    if (!GIT_PUSH_RE.test(command)) return;

    // ── Locate the repo being pushed ──────────────────────────────────────────
    const cwd = extractCwd(command);
    const pkg = readPackageJson(cwd);

    if (!pkg || !isPiExtensionWithTests(pkg)) return;

    // ── Run npm test ───────────────────────────────────────────────────────────
    const name = (pkg.name as string | undefined) ?? cwd;
    ctx.ui.notify(
      `pi-extension-guard: running npm test for ${name} before push…`,
      "info",
    );

    const { stdout, stderr, code } = await pi.exec("npm", ["test"], {
      cwd,
    });

    if (code !== 0) {
      const output = (stderr || stdout || "").trim();
      const summary = output.length > 800 ? output.slice(0, 800) + "\n…(truncated)" : output;

      return {
        block: true,
        reason:
          `pi-extension-guard: npm test failed for ${name} — fix errors before pushing.\n\n` +
          `${summary}\n\n` +
          `After fixing: re-run \`git add\` on modified files, then retry the push.`,
      };
    }

    ctx.ui.notify(
      `pi-extension-guard: npm test passed for ${name} ✅ — proceeding with push`,
      "info",
    );
  });
}
