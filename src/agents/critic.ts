import { chatJSONValidated } from '../llm/index.js';
import {
    CriticOutput,
    type CriticOutputT,
    type AnalyzerOutputT,
} from './schemas.js';

const SYSTEM_PROMPT = `Audit a list of findings on a competitive-programming solution. For each finding return ONE decision:
- "keep"   — valid as-is given the problem + constraints. Echo it back in "original".
- "drop"   — wrong, irrelevant to a judge, or a duplicate.
- "modify" — real point but vague / mis-categorized / wrong severity / wrong complexity tag. Provide a corrected version in "revised".

Judge each finding against the problem's constraints — keep what would cost WA/TLE/MLE/RE, drop what wouldn't:
- Complexity: a finding saying O(n^2) is too slow but n ≤ 1000 → drop (budget allows it). n ≤ 10^5 → keep. n ≤ 10^9 + O(n) → keep + raise severity (already TLE).
- Severity: bug that fails a sample = "critical"; bug that only fails a rare boundary = "high"/"medium".
- Category: off-by-one = "bug" (not "complexity"). Missing n=0 handling = "edge-case" (not "bug"). Mis-categorized → modify.
- Complexity tag: if the stated time/space tag doesn't match the actual loop, modify and fix it.
- Duplicates: drop the weaker one ("duplicate of <title>").
- Style / naming critiques: drop — judges don't care.

Never invent findings the original reviewer didn't raise.

Respond with a SINGLE JSON object — no markdown fences, no commentary:
{
  "reviewedFindings": [
    { "decision": "keep" | "drop" | "modify",
      "original": { "severity": "low"|"medium"|"high"|"critical",
                    "category": "bug"|"smell"|"complexity"|"security"|"performance"|"edge-case",
                    "title": string, "description": string,
                    "line"?: int, "timeComplexity"?: string, "spaceComplexity"?: string },
      "revised":  { ...same shape as original... },                                       // ONLY when decision = "modify"; omit for keep/drop
      "reason":   string }                                                                // max 500 chars; ALWAYS required (keep + drop + modify); cite the constraint or code line that justifies the decision
  ],
  "summary": string                                                                       // max 500 chars; overall takeaway
}
Max 15 entries.`;

function buildUserPrompt(
    code: string,
    language: string,
    problemStatement: string,
    findings: AnalyzerOutputT,
): string {
    return `Language: ${language}

Problem:
${problemStatement}

Code:
\`\`\`${language}
${code}
\`\`\`

Findings:
${JSON.stringify(findings)}`;
}

export async function critique(
    code: string,
    language: string,
    problemStatement: string,
    findings: AnalyzerOutputT,
): Promise<CriticOutputT> {
    return chatJSONValidated(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement, findings),
        CriticOutput,
        'Critic',
    );
}
