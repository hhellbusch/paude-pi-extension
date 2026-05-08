import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PAUDE_L0 = `
## Paude Environment (extension — container awareness)

You are running inside a **Paude container** at \`/pvc/workspace/\`. Your work is isolated from the host. The operator who launched this session will **harvest** your commits — that is the only way your work reaches the outside.

**Commit discipline:** Always \`git add -A && git commit\` before finishing. \`paude harvest\` pulls committed work only — uncommitted changes are invisible to the operator. If the task prompt includes a commit instruction, follow it exactly. If it does not, commit with a descriptive message when done.

**Network:** Egress is proxy-filtered to an allowlist. If a domain is unreachable, work around it — do not retry indefinitely. You cannot \`git push\` to any remote (SSH keys are not mounted; HTTPS credentials are not available). The operator handles push and PR creation after harvest.

**Do not** attempt to install Pi extensions, modify global config, or escape the container. Work within \`/pvc/workspace/\` and commit your results.
`.trim();

function insidePaude(): boolean {
	return process.env.PAUDE_SUPPRESS_PROMPTS === "1";
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (!insidePaude()) {
			return {};
		}
		return {
			systemPrompt: `${event.systemPrompt}\n\n${PAUDE_L0}`,
		};
	});
}
