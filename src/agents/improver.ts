import { chatJSON } from '../llm/ollama.js';
import {
    ImproverOutput,
    type ImproverOutputT,
    type CriticOutputT,
} from './schemas.js';

const SYSTEM_PROMPT = `You are a senior software engineer rewriting code to fix issues that have already been reviewed and approved by a code-review auditor.

You will receive:
- the original code
- the auditor's reviewed findings (each marked "keep", "drop", or "modify")

Your job:
- Rewrite the code to fix every "keep" finding and every "modify" finding (use the "revised" version of modified findings).
- IGNORE all "drop" findings — those were rejected by the auditor.
- Make the smallest changes necessary. Do not refactor unrelated code, rename variables for taste, or restructure beyond what the findings require.
- Preserve the original function signatures, exports, and overall behavior unless a finding explicitly requires changing them.
- Do not invent new bugs to fix that weren't in the findings.

You MUST respond with a single JSON object matching exactly this shape — no markdown fences, no commentary, no extra text:

{
  "improvedCode": string (the full rewritten code, ready to drop in as a replacement),
  "changeNotes": [
    {
      "title": string (max 150 chars, short label for the change),
      "description": string (max 1000 chars, what changed and why, referencing the finding it addresses),
      "line": number (optional, line in the IMPROVED code where the change is)
    }
  ],
  "summary": string (max 500 chars, overall description of the improvements)
}

Rules:
- "improvedCode" MUST be the complete file/snippet, not a diff or a partial.
- Every change you make MUST have a corresponding entry in "changeNotes". One note per logical change.
- Never include markdown code fences (\`\`\`) inside "improvedCode" — it is a raw string of source code.
- Return at most 15 change notes.`;

function buildUserPrompt(code: string, language: string, reviewed: CriticOutputT): string {
    return `Language: ${language}

Original code:
\`\`\`${language}
${code}
\`\`\`

Auditor's reviewed findings (JSON):
${JSON.stringify(reviewed, null, 2)}`;
}

export async function improve(
    code: string,
    language: string,
    reviewed: CriticOutputT
): Promise<ImproverOutputT> {
    const raw = await chatJSON<unknown>(SYSTEM_PROMPT, buildUserPrompt(code, language, reviewed));
    const parsed = ImproverOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Improver raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    return parsed.data;
}
