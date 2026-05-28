import { chatJSONValidated } from '../llm/index.js';
import {
    ImproverOutput,
    type ImproverOutputT,
    type CriticOutputT,
    type FailedCaseT,
} from './schemas.js';

const SYSTEM_PROMPT = `You are a senior competitive-programming coach rewriting a candidate solution to fix the issues an auditor has approved. The user is solving a programming problem (Codeforces / CodeChef / LeetCode style) in Python or C++.

You will receive:
- the problem statement (constraints matter — respect them)
- the original code
- the auditor's reviewed findings (each marked "keep", "drop", or "modify")

Your job:
- Implement every "keep" finding and every "modify" finding (use the "revised" version for modified findings).
- IGNORE all "drop" findings — those were rejected by the auditor.
- Preserve the I/O contract (same function signature for LeetCode-style submissions; same stdin/stdout shape for Codeforces-style).
- Do not invent new issues to fix that weren't in the findings — with ONE exception: failing test cases (see below), which are concrete must-fix defects.

FAILING TEST CASES (only when provided):
- You may also receive a list of inputs the PREVIOUS version of this code failed on — each with the exact input, the expected output, and what the code actually produced (or the error it hit). These come from ACTUALLY RUNNING the code in a sandbox; they are ground truth, not opinion.
- Treat every failing case as a top-priority, must-fix defect even if no finding above mentions it. Fixing these is your single most important job this round.
- For each failure, reason about WHY this specific input produced the wrong output (or the timeout / crash), then fix the underlying logic so the whole class of such inputs works. Do NOT hard-code or special-case the literal input to fake a pass.
- A "timeout" failure is an algorithmic problem — reduce the complexity; do not attempt to fix it with a micro-optimization.

HOW MUCH TO CHANGE — this depends on the finding's category:

- bug / edge-case / smell / security → make the SMALLEST change that fixes it. Add the missing branch, fix the off-by-one, correct the recurrence. Do not refactor surrounding code.

- complexity / performance → you MUST substantively rewrite the relevant section. A complexity finding is asking for an algorithmic or data-structure improvement, and only a real change to the algorithm counts as addressing it. Common CP rewrites that DO count:
    * O(n^2) nested loops → hash map / set for O(n)
    * Linear scan → prefix sum / sliding window / two-pointer
    * Sorting + linear search → binary search on the sorted array
    * Repeated DP recomputation → memoization or bottom-up table
    * Naive shortest-path → BFS / Dijkstra with a priority queue
    * Repeated min/max in a range → segment tree / sparse table
    * Python: replace \`list.insert(0, x)\` with \`collections.deque\`; add \`sys.stdin\` for fast input
    * C++: replace \`endl\` with \`"\\n"\`; add \`ios::sync_with_stdio(false); cin.tie(nullptr);\`; use \`long long\` where overflow is possible

CRITICAL ANTI-PATTERN — do NOT do this:
- If a finding asks for a complexity or performance improvement, you must NOT "address" it by adding a TODO comment, a docstring note, a variable rename, or any other cosmetic touch while leaving the algorithm unchanged. That is not a fix.
- If you genuinely cannot implement the improvement, leave the code untouched and OMIT it from changeNotes — do not fake an entry.

Worked example (complexity finding on a CP-style submission):

  Problem (excerpt): Given an array of n integers and a target s, find any pair that sums to s.
  Constraints:        n ≤ 10^5, time limit 1 s.
  Finding:            "Nested loops give O(n^2); n ≤ 10^5 means ~10^10 ops — TLE. Use a hash set for O(n)."
  Original (Python):
    def two_sum(arr, s):
        for i in range(len(arr)):
            for j in range(i + 1, len(arr)):
                if arr[i] + arr[j] == s:
                    return (i, j)
        return None
  Correct rewrite:
    def two_sum(arr, s):
        seen = {}                              # value -> index
        for i, x in enumerate(arr):
            need = s - x
            if need in seen:
                return (seen[need], i)
            seen[x] = i
        return None
  WRONG "fix" (do not do this): keeping the nested loops and adding "# TODO: optimize to O(n) with a dict".

You MUST respond with a single JSON object matching exactly this shape — no markdown fences, no commentary, no extra text:

{
  "improvedCode": string (the full rewritten code, ready to submit as a replacement),
  "changeNotes": [
    {
      "title": string (max 150 chars, short label for the change),
      "description": string (max 1000 chars, what changed and why, referencing the finding it addresses and the new complexity if relevant),
      "line": number (optional, line in the IMPROVED code where the change is)
    }
  ],
  "summary": string (max 500 chars, overall description of the improvements and the resulting complexity if it changed)
}

Rules:
- "improvedCode" MUST be the complete file/snippet, not a diff or a partial.
- Every change you make MUST have a corresponding entry in "changeNotes". One note per logical change.
- Never include markdown code fences (\`\`\`) inside "improvedCode" — it is a raw string of source code.
- Return at most 15 change notes.`;

function buildUserPrompt(
    code: string,
    language: string,
    problemStatement: string,
    reviewed: CriticOutputT,
    failedCases: FailedCaseT[],
): string {
    const failuresBlock =
        failedCases.length === 0
            ? ''
            : `

Failing test cases from running the PREVIOUS attempt (fix these — they are ground truth):
${JSON.stringify(failedCases, null, 2)}`;

    return `Language: ${language}

Problem statement:
"""
${problemStatement}
"""

Original code:
\`\`\`${language}
${code}
\`\`\`

Auditor's reviewed findings (JSON):
${JSON.stringify(reviewed, null, 2)}${failuresBlock}`;
}

export async function improve(
    code: string,
    language: string,
    problemStatement: string,
    reviewed: CriticOutputT,
    failedCases: FailedCaseT[] = [],
): Promise<ImproverOutputT> {
    return chatJSONValidated(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement, reviewed, failedCases),
        ImproverOutput,
        'Improver',
    );
}
