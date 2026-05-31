import { chatJSONValidated } from '../llm/index.js';
import { AnalyzerOutput, type AnalyzerOutputT } from './schemas.js';

const SYSTEM_PROMPT = `Review a DSA / competitive-programming submission (Python/C++) and report concrete issues that would cause Wrong Answer / Time Limit Exceeded / Memory Limit Exceeded / Runtime Error on a judge.

Approach: extract the constraints (n bound, value bound, time limit ⇒ ~10^8 ops/s budget); identify the algorithmic pattern (two-pointer, sliding window, DP, BFS/DFS, binary search, greedy, Union-Find, segment tree, hashing, etc.); compute worst-case time/space vs the budget; walk through edge cases the problem implies (empty / single / max constraint / duplicates / negatives / zero / any boundary the statement highlights); look for off-by-one, wrong loop bounds, uninitialized accumulators, integer overflow (C++ int vs long long), 0- vs 1-indexed mismatches, and I/O issues (slow Python input(), C++ cin without sync_with_stdio).

Categories:
- complexity   — algorithmic time/space too high for the constraints (TLE/MLE). Always populate timeComplexity (and spaceComplexity when relevant).
- edge-case    — mishandles a boundary input the problem allows.
- bug          — wrong behavior on some valid non-boundary input (wrong condition / recurrence / off-by-one / overflow).
- performance  — constant-factor or I/O concerns risking TLE despite OK asymptotics.
- smell        — structural issue hurting correctness reasoning (mutable globals, shadowed vars, dead code). Use sparingly.
- security     — rare for CP; only things like eval(input()).

Do NOT flag whitespace/naming/style — judges don't care. Do NOT invent issues — every finding must point to something concrete in the code, judged against the problem. If the code is correct and within budget, return an empty findings array and say so in summary.

Respond with a SINGLE JSON object — no markdown fences, no commentary:
{
  "findings": [
    { "severity": "low"|"medium"|"high"|"critical",
      "category": "bug"|"smell"|"complexity"|"security"|"performance"|"edge-case",
      "title":       string,                                  // max 150 chars
      "description": string,                                  // one paragraph: what's wrong, why it matters given constraints, how to fix
      "line"?:            int,                                // 1-indexed line in the submitted code
      "timeComplexity"?:  string,                             // short Big-O like "O(n^2)" — include for runtime findings
      "spaceComplexity"?: string }                            // short Big-O — include for memory findings
  ],
  "summary": string                                           // max 500 chars; pattern identified + dominant bottleneck or correctness risk
}
Max 10 findings, ordered by severity (critical first).`;

function buildUserPrompt(code: string, language: string, problemStatement: string): string {
    return `Language: ${language}

Problem:
${problemStatement}

Code:
\`\`\`${language}
${code}
\`\`\``;
}

export async function analyze(
    code: string,
    language: string,
    problemStatement: string,
): Promise<AnalyzerOutputT> {
    return chatJSONValidated(
        SYSTEM_PROMPT,
        buildUserPrompt(code, language, problemStatement),
        AnalyzerOutput,
        'Analyzer',
    );
}
