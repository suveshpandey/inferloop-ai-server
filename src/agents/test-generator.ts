import { chatJSONValidated } from '../llm/index.js';
import { TestGeneratorOutput, type TestGeneratorOutputT } from './schemas.js';
import { env } from '../config/env.js';

const SYSTEM_PROMPT = `Design test cases that PROBE a candidate DSA / competitive-programming solution (Python/C++) — not solve the problem. Find inputs that separate a correct solution from common wrong ones.

Approach: extract the input format + constraints; think about failure modes (off-by-one, integer overflow — probe with large element VALUES like 10^9 using a few elements, unhandled duplicates, missing empty/single-element case, negatives or zero where allowed, any boundary the statement highlights); compute the correct expectedOutput yourself for each input — get it right.

Aim for ~6 cases — a mix of:
- "sample" cases: typical inputs, like the examples in the statement.
- "edge"   cases: empty / single / minimum size / duplicates / negatives / zero / max element VALUE (for overflow probing).

CRITICAL — every input must be SMALL and written out IN FULL:
- At most ~20 numbers per input. Write every value explicitly. Never use "...", ellipsis, abbreviation, or a described input — a partial input is a broken test.
- Do NOT produce large constraint-boundary inputs (e.g. n = 10^5). You can't write them out and can't compute their correct output. Probe the SAME logic with a tiny input (test duplicates with 3 numbers; probe overflow with two 10^9 values). Detecting TLE is not your job.
- Inputs must match the problem's stated input format EXACTLY (same lines, same token order, same separators). A malformed input is worse than no test.

Respond with a SINGLE JSON object — no markdown fences, no commentary:
{
  "cases": [
    { "name":           string,                       // short label, e.g. "edge: n=1", "sample 1"
      "input":          string,                       // exact stdin the program reads — preserve newlines and spacing
      "expectedOutput": string,                       // exact stdout a correct solution prints
      "category":       "sample" | "edge" }
  ],
  "summary": string                                   // max 500 chars; what these cases collectively probe for
}`;

function buildUserPrompt(
    code: string,
    language: string,
    problemStatement: string,
    maxCases: number,
): string {
    return `Language: ${language}
Generate at most ${maxCases} test cases.

Problem:
${problemStatement}

Candidate solution (probe — do not assume correct):
\`\`\`${language}
${code}
\`\`\``;
}

export async function generateTestCases(
    code: string,
    language: string,
    problemStatement: string,
    maxCases: number = env.MAX_GENERATED_CASES,
): Promise<TestGeneratorOutputT> {
    const result = await chatJSONValidated(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement, maxCases),
        TestGeneratorOutput,
        'Test-generator',
    );
    // Enforce the cap ourselves — the model occasionally ignores it.
    if (result.cases.length > maxCases) {
        result.cases = result.cases.slice(0, maxCases);
    }
    return result;
}
