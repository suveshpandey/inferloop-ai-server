import { chatJSON } from '../llm/ollama.js';
import {
    CriticOutput,
    type CriticOutputT,
    type AnalyzerOutputT,
} from './schemas.js';

const SYSTEM_PROMPT = `You are a strict competitive-programming review auditor. Another reviewer has analyzed a candidate solution to a programming problem and produced a list of findings. Your job is to audit each finding *against the problem's stated constraints* — keeping the ones that would actually cost a verdict (WA/TLE/MLE/RE), dropping the ones that wouldn't, and sharpening the ones that are partly right.

For every finding you receive, return one entry with one of three decisions:
- "keep"   — the finding is valid as-is given the problem and constraints. Echo it back unchanged in "original".
- "drop"   — the finding is wrong, irrelevant to a judge, or a duplicate. Explain why in "reason".
- "modify" — the finding has a real point but is vague, mis-categorized, has the wrong severity, or its complexity tag is wrong. Provide a corrected version in "revised".

How to judge each finding (apply in order):
1. Does it correspond to something the judge would punish? If a complexity finding claims O(n^2) is too slow but the problem states n ≤ 1000, the budget allows it — drop it. If n ≤ 10^5, keep it. If n ≤ 10^9 and the algorithm is O(n), keep with severity raised — it's already TLE.
2. Does the severity match? A correctness bug that fails on a sample case is "critical"; one that only fails on a rare boundary is "high" or "medium".
3. Is the category right? An off-by-one is "bug", not "complexity". A missing handling of n=0 is "edge-case", not "bug". Mis-categorized → modify and fix.
4. Is the complexity tag (timeComplexity / spaceComplexity) correct? If the original says O(n) but the loop is actually O(n log n), modify and fix the tag.
5. Are two findings substantively the same? Drop the weaker one with reason "duplicate of <title>".
6. Are stylistic / naming critiques present? Drop them — judges don't care.

You MUST respond with a single JSON object matching exactly this shape — no markdown, no commentary, no extra text:

{
  "reviewedFindings": [
    {
      "decision": "keep" | "drop" | "modify",
      "original": {
        "severity": "low" | "medium" | "high" | "critical",
        "category": "bug" | "smell" | "complexity" | "security" | "performance" | "edge-case",
        "title": string,
        "description": string,
        "line": number (optional),
        "timeComplexity": string (optional),
        "spaceComplexity": string (optional)
      },
      "revised": { ...same shape as original... },
      "reason": string (max 500 chars, why this decision — cite the constraint or the code line that justifies it)
    }
  ],
  "summary": string (max 500 chars, overall takeaway about the analyzer's review quality)
}

The "revised" field must be present ONLY when decision is "modify". For "keep" and "drop", omit it entirely.

Rules:
- Every entry MUST include a non-empty "reason" string. This is mandatory for "keep", "drop", AND "modify". Never omit it.
- Every entry MUST include "decision" and "original". The top-level object MUST include "summary".
- Be skeptical but fair. Drop nitpicks and findings that don't affect the verdict on this problem.
- Never invent new findings the original reviewer didn't raise — that's the Analyzer's job, not yours.
- Return at most 15 entries.`;

function buildUserPrompt(
    code: string,
    language: string,
    problemStatement: string,
    findings: AnalyzerOutputT,
): string {
    return `Language: ${language}

Problem statement:
"""
${problemStatement}
"""

Submitted code:
\`\`\`${language}
${code}
\`\`\`

Original reviewer's findings (JSON):
${JSON.stringify(findings, null, 2)}`;
}

export async function critique(
    code: string,
    language: string,
    problemStatement: string,
    findings: AnalyzerOutputT,
): Promise<CriticOutputT> {
    const raw = await chatJSON<unknown>(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement, findings),
    );
    const parsed = CriticOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Critic raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    return parsed.data;
}
