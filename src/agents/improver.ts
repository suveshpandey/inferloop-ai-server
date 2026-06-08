import { chatJSONValidated } from '../llm/index.js';
import {
    ImproverOutput,
    type ImproverOutputT,
    type CriticOutputT,
    type FailedCaseT,
} from './schemas.js';

const SYSTEM_PROMPT = `Rewrite a DSA / competitive-programming solution (Python/C++) to fix issues an auditor approved. Inputs: problem statement, original code, reviewed findings ("keep" / "drop" / "modify"), optionally previous-attempt failing cases (input/expected/actual).

RULES:
- Implement every "keep" + "modify" (use its "revised"). Ignore "drop". Don't invent issues. Failing cases (when present) are top-priority must-fix even if no finding mentions them — fix the root cause, never hard-code the input; "timeout" → reduce complexity, not constants.
- PRESERVE STRUCTURE (non-negotiable): keep main()/the entry point AND every stdin read + stdout write EXACTLY as the original; keep every function the original defined; keep every #include/import (add new ones your rewrite needs). Findings target inner algorithms — they NEVER authorize removing main(), the I/O wrapper, or any function.
- Match scope: bug/edge-case/smell/security → smallest local change. complexity/performance → substantive algorithmic rewrite (hash, sliding window, BFS, DP, etc.) — a TODO/rename/docstring is NOT a fix. If you can't implement it, omit it from changeNotes.
- COMMENTS in improvedCode: MINIMAL. Short single-line only where the algorithm is genuinely non-obvious. NEVER multi-line / docstring / block comments. NEVER restate a fix as a code comment — that explanation belongs in changeNotes.description, not in the code.

WORKED EXAMPLE — Codeforces-style C++, finding "use unordered_set for O(n)":
  CORRECT (function body fixed; main() + cin/cout preserved verbatim; new #include added):
    #include <iostream>
    #include <vector>
    #include <unordered_set>
    using namespace std;
    bool containsDuplicate(vector<int>& nums) {
        unordered_set<int> seen;
        for (int x : nums) { if (seen.count(x)) return true; seen.insert(x); }
        return false;
    }
    int main() {
        int n; cin >> n;
        vector<int> nums(n);
        for (int i = 0; i < n; i++) cin >> nums[i];
        cout << containsDuplicate(nums);
    }
  WRONG: returning only the rewritten function with no main(). Reads no input, writes no output, every sandbox test fails.

BREVITY (required): "summary" MUST be at most 500 characters — one tight paragraph.

Respond with a SINGLE JSON object — no markdown fences, no commentary:
{
  "improvedCode": string,                                                           // complete file; never a diff/partial; never wrapped in \`\`\` fences
  "changeNotes": [ { "title": string, "description": string, "line"?: number } ],   // max 15; one per logical change
  "summary":      string                                                            // max 500 chars
}`;

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
            : `\n\nFailing cases from the previous attempt (ground truth — must fix):\n${JSON.stringify(failedCases)}`;

    // Strip "drop" entries — Improver ignores them anyway, no point paying tokens.
    const actionable = {
        ...reviewed,
        reviewedFindings: reviewed.reviewedFindings.filter((f) => f.decision !== 'drop'),
    };

    return `Language: ${language}

Problem:
${problemStatement}

Original code:
\`\`\`${language}
${code}
\`\`\`

Reviewed findings (keep + modify only):
${JSON.stringify(actionable)}${failuresBlock}`;
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
