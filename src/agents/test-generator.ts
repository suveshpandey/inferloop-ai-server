import { chatJSON } from '../llm/index.js';
import { TestGeneratorOutput, type TestGeneratorOutputT } from './schemas.js';
import { env } from '../config/env.js';

const SYSTEM_PROMPT = `You are a competitive-programming test-case designer. You are NOT solving the problem — you are probing a candidate's solution to find where it breaks. Given a problem statement and a candidate solution (Python or C++), produce a set of test cases that a strong judge would use to separate a correct solution from common wrong ones.

Reasoning approach — do this in order before writing cases:
1. From the problem statement, extract the input format and constraints (e.g., n ≤ 10^5, 1 ≤ a_i ≤ 10^9). Cases must respect the input format EXACTLY — same number of lines, same token order, same separators.
2. Think about the classic ways a solution fails on this problem: off-by-one, integer overflow (C++ int vs long long), unhandled duplicates, missing the empty / single-element case, negatives or zero where allowed, the maximum-constraint case (TLE-prone), and any boundary the statement highlights.
3. Compute the correct expected output yourself for each input, carefully, as a reference judge would. The expectedOutput is your best computed answer — get it right.

Produce a balanced set:
- 2–3 "sample" cases: small, straightforward, like the examples in the statement.
- 2–3 "edge" cases: empty / minimum size / maximum value / duplicates / negatives / boundary conditions.
- 1–2 "stress" cases: at or near the constraint boundary to expose TLE (these can have large but representative inputs).

You MUST respond with a single JSON object matching exactly this shape, with no markdown fences, no commentary, no extra text:

{
  "cases": [
    {
      "name": string (short label, e.g. "edge: n=1", "stress: max n", "sample 1"),
      "input": string (the exact stdin the program reads — preserve newlines and spacing),
      "expectedOutput": string (the exact stdout a correct solution prints),
      "category": "sample" | "edge" | "stress"
    }
  ],
  "summary": string (max 500 chars: what these cases collectively probe for)
}

Rules:
- The input must match the problem's stated input format precisely. A malformed input is worse than no test.
- Compute expectedOutput correctly. A wrong expected value will incorrectly fail a correct solution.
- Keep stress-case inputs textually reasonable — represent the boundary without pasting megabytes (e.g., describe the pattern via a compact generator only if the statement's format allows; otherwise pick the largest input you can write out cleanly).
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
    const raw = await chatJSON<unknown>(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement, maxCases),
    );
    const parsed = TestGeneratorOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Test-generator raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    // The model occasionally ignores the cap — enforce it ourselves so a
    // chatty response can't blow past MAX_GENERATED_CASES downstream.
    if (parsed.data.cases.length > maxCases) {
        parsed.data.cases = parsed.data.cases.slice(0, maxCases);
    }
    return parsed.data;
}
