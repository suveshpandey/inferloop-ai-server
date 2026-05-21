import 'dotenv/config';
import { analyze } from '../agents/analyzer.js';
import { critique } from '../agents/critic.js';
import { improve } from '../agents/improver.js';

const problemStatement = `Given an array a of n integers and a target s, find any pair of distinct indices (i, j) such that a[i] + a[j] = s. Return the pair, or report that no such pair exists.

Constraints:
  1 <= n <= 10^5
  -10^9 <= a[i] <= 10^9
  -10^9 <= s <= 10^9
  Time limit: 1 second
  Memory limit: 256 MB`;

const code = `
def two_sum(a, s):
    n = len(a)
    for i in range(n):
        for j in range(i + 1, n):
            if a[i] + a[j] == s:
                return (i, j)
    return None
`;

async function main() {
    console.log('--- Step 1: Analyzer ---');
    const findings = await analyze(code, 'python', problemStatement);
    console.log(JSON.stringify(findings, null, 2));

    console.log('\n--- Step 2: Critic ---');
    const reviewed = await critique(code, 'python', problemStatement, findings);
    console.log(JSON.stringify(reviewed, null, 2));

    console.log('\n--- Step 3: Improver ---');
    const improved = await improve(code, 'python', problemStatement, reviewed);
    console.log(JSON.stringify(improved, null, 2));

    console.log('\n--- Improved code (raw) ---');
    console.log(improved.improvedCode);
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
