import { chatJSONValidated } from '../llm/index.js';
import { TestGeneratorOutput, type TestGeneratorOutputT } from './schemas.js';
import { env } from '../config/env.js';

const SYSTEM_PROMPT = `You are a competitive-programming test-case designer. You are NOT solving the problem — you are probing a candidate's solution to find where it breaks. Given a problem statement and a candidate solution (Python or C++), produce a set of test cases that a strong judge would use to separate a correct solution from common wrong ones.

Reasoning approach — do this in order before writing cases:
1. From the problem statement, extract the input format and constraints (e.g., n ≤ 10^5, 1 ≤ a_i ≤ 10^9). Cases must respect the input format EXACTLY — same number of lines, same token order, same separators.
2. Think about the classic ways a solution fails on this problem: off-by-one, integer overflow (C++ int vs long long — probe with large element VALUES like 10^9, using only a few elements), unhandled duplicates, missing the empty / single-element case, negatives or zero where allowed, and any boundary the statement highlights.
3. Compute the correct expected output yourself for each input, carefully, as a reference judge would. The expectedOutput is your best computed answer — get it right.

Produce ~6 cases total — a mix of:
- "sample" cases: typical inputs, like the examples in the statement.
- "edge" cases: empty / single element / minimum size / duplicates / negatives / zero / the maximum allowed element VALUE (to probe overflow).

CRITICAL — every input must be SMALL and written out IN FULL:
- At most ~20 numbers per input. Write every value explicitly. Never use "...", an ellipsis, an abbreviation, or a described input — a partial input is a broken test.
- Do NOT produce large constraint-boundary inputs (e.g. n = 10^5). You cannot write them out completely, and you cannot compute their correct output. Probe the SAME logic with a tiny input instead (test duplicates with 3 numbers, not 100000; probe overflow with two values of 10^9, not a huge array). Detecting slowness/TLE is not your job.

You MUST respond with a single JSON object matching exactly this shape, with no markdown fences, no commentary, no extra text:

{
  "cases": [
    {
      "name": string (short label, e.g. "edge: n=1", "stress: max n", "sample 1"),
      "input": string (the exact stdin the program reads — preserve newlines and spacing),
      "expectedOutput": string (the exact stdout a correct solution prints),
      "category": "sample" | "edge"
    }
  ],
  "summary": string (max 500 chars: what these cases collectively probe for)
}

Rules:
- The input must match the problem's stated input format precisely. A malformed input is worse than no test.
- Compute expectedOutput correctly. A wrong expected value will incorrectly fail a correct solution.
- Every input must be small and written out in full — no ellipsis, no abbreviation, no described inputs. A partial or abbreviated input is a broken test.
- Do not include markdown, backticks, or any prose outside the JSON object.`;

function buildUserPrompt(
    code: string,
    language: string,
    problemStatement: string,
    maxCases: number,
): string {
    return `Language: ${language}
Generate at most ${maxCases} test cases.

Problem statement:
"""
${problemStatement}
"""

Candidate solution (probe this — do not assume it is correct):
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
