import 'dotenv/config';
import { analyze } from '../agents/analyzer.js';

// Classic CP fixture: Two Sum with O(n^2) nested loops. At n = 10^5 this is
// ~10^10 ops — far over the ~10^8 budget for a 1 s time limit. A correct
// analyzer should flag the complexity finding and tag it as O(n^2).
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
  const result = await analyze(code, 'python', problemStatement);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
