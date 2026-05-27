// Standalone harness for the test-generator agent (Sub-phase 2.3).
//
// Run: pnpm tsx src/scripts/test-test-generator.ts
//
// Hits the live LLM (whatever LLM_PROVIDER points at). On Ollama
// (qwen2.5-coder:7b) the cases will be sane but modest; on Gemini they're
// noticeably sharper on harder problems. That quality gap is expected, not a
// defect — this harness only checks SHAPE and basic sanity, not cleverness.

import { generateTestCases } from '../agents/test-generator.js';
import { TestGeneratorOutput } from '../agents/schemas.js';

const PROBLEM = `Two Sum.

You are given an array of n integers and a target value t. Determine whether
there exist two distinct indices i and j (i != j) such that a[i] + a[j] == t.

Input:
  Line 1: two integers n and t (1 <= n <= 10^5, -10^9 <= t <= 10^9).
  Line 2: n integers a[1..n] (-10^9 <= a[i] <= 10^9), space-separated.

Output:
  Print "YES" if such a pair exists, otherwise "NO".`;

const SOLUTION = `import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0]); t = int(data[1])
    a = list(map(int, data[2:2 + n]))
    seen = set()
    for x in a:
        if t - x in seen:
            print("YES")
            return
        seen.add(x)
    print("NO")

main()`;

async function main() {
    console.log('Generating test cases (provider:', process.env.LLM_PROVIDER || 'ollama', ')...\n');

    const result = await generateTestCases(SOLUTION, 'python', PROBLEM);

    // 1. Shape: must validate against the Zod schema.
    const parsed = TestGeneratorOutput.safeParse(result);
    if (!parsed.success) {
        console.error(JSON.stringify(result, null, 2));
        throw new Error('Output failed TestGeneratorOutput schema validation');
    }

    const { cases, summary } = parsed.data;

    // 2. Count: between 3 and 8 (default MAX_GENERATED_CASES cap).
    if (cases.length < 3 || cases.length > 8) {
        throw new Error(`Expected 3–8 cases, got ${cases.length}`);
    }

    // 3. Every case has a non-empty input and expectedOutput (Two Sum has no
    //    legitimately-empty inputs; n >= 1 always).
    cases.forEach((c, i) => {
        if (c.input.trim().length === 0) {
            throw new Error(`Case ${i} ("${c.name}") has empty input`);
        }
        if (c.expectedOutput.trim().length === 0) {
            throw new Error(`Case ${i} ("${c.name}") has empty expectedOutput`);
        }
    });

    // Eyeball output: categories should span sample/edge/stress.
    console.log('Summary:', summary, '\n');
    cases.forEach((c, i) => {
        console.log(`[${i}] ${c.name}  (${c.category ?? 'uncategorized'})`);
        console.log(`    input:    ${JSON.stringify(c.input).slice(0, 80)}`);
        console.log(`    expected: ${JSON.stringify(c.expectedOutput).slice(0, 80)}`);
    });

    const categories = new Set(cases.map((c) => c.category).filter(Boolean));
    console.log(`\nCategories seen: ${[...categories].join(', ') || '(none)'}`);
    console.log(`\n✅ All assertions passed (${cases.length} cases, valid shape).`);
}

main().catch((err) => {
    console.error('\n❌ Harness failed:', err);
    process.exit(1);
});
