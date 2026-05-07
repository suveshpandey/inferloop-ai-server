import { chatJSON } from '../llm/ollama.js';
import {
    EvaluatorOutput,
    type EvaluatorOutputT,
    type CriticOutputT,
} from './schemas.js';

const SYSTEM_PROMPT = `You are a senior staff engineer judging whether a code rewrite is an improvement over the original.

You will receive:
- the ORIGINAL code
- the IMPROVED code (a rewrite produced by another engineer)
- the auditor's reviewed findings — only "keep" and "modify" entries are issues that the rewrite was supposed to fix. "drop" entries should NOT have been fixed.

Your job is to score the rewrite on four independent 0–100 dimensions (higher is always better) and give a final verdict.

Scoring dimensions:
- "correctness": Does the improved code preserve the original behavior and still run? 100 = behaviorally equivalent or strictly better. 0 = clearly broken.
- "bugFixCoverage": Of the "keep" + "modify" findings, how many were actually fixed in the rewrite? 100 = every targeted issue addressed. 0 = none addressed.
- "stability": Did the rewrite avoid introducing NEW issues (new bugs, dead code, broken imports, etc)? 100 = no regressions. 0 = many regressions.
- "readability": Is the improved code at least as readable as the original? 100 = clearer; 50 = roughly equal; 0 = much harder to read.
- "overall": Your holistic 0–100 score for the rewrite.

Verdict:
- "improved"  — the rewrite is meaningfully better.
- "unchanged" — the rewrite makes no real difference.
- "regressed" — the rewrite is worse than the original (broke something or made things less clear).

You MUST respond with a single JSON object matching exactly this shape — no markdown fences, no commentary, no extra text:

{
  "verdict": "improved" | "unchanged" | "regressed",
  "scores": {
    "correctness":    number 0..100,
    "bugFixCoverage": number 0..100,
    "stability":      number 0..100,
    "readability":    number 0..100,
    "overall":        number 0..100
  },
  "rationale": string (max 2000 chars, prose explaining the verdict and notable score drivers),
  "unaddressedFindings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "bug" | "smell" | "complexity" | "security" | "performance" | "style",
      "title": string,
      "description": string,
      "line": number (optional)
    }
  ]
}

Rules:
- Every score MUST be an integer between 0 and 100 inclusive.
- "rationale" is mandatory and must be non-empty.
- "unaddressedFindings" lists any "keep" or "modify" findings the rewrite failed to fix. If everything was fixed, return an empty array [] or omit the field.
- Never invent issues. Only judge what's in the code or in the reviewed findings.
- Be honest — if the rewrite is unchanged or worse, say so.`;

function buildUserPrompt(
    originalCode: string,
    improvedCode: string,
    language: string,
    reviewed: CriticOutputT,
): string {
    return `Language: ${language}

ORIGINAL code:
\`\`\`${language}
${originalCode}
\`\`\`

IMPROVED code:
\`\`\`${language}
${improvedCode}
\`\`\`

Auditor's reviewed findings (JSON):
${JSON.stringify(reviewed, null, 2)}`;
}

export async function evaluate(
    originalCode: string,
    improvedCode: string,
    language: string,
    reviewed: CriticOutputT,
): Promise<EvaluatorOutputT> {
    const raw = await chatJSON<unknown>(
        SYSTEM_PROMPT,
        buildUserPrompt(originalCode, improvedCode, language, reviewed),
    );
    const parsed = EvaluatorOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Evaluator raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    return parsed.data;
}
