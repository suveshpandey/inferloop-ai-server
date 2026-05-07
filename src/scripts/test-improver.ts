import 'dotenv/config';
import { analyze } from '../agents/analyzer.js';
import { critique } from '../agents/critic.js';
import { improve } from '../agents/improver.js';

const code = `
async function getUser(id) {
  const res = await fetch('/api/users/' + id);
  const data = res.json();
  return data.user;
}
`;

async function main() {
    console.log('--- Step 1: Analyzer ---');
    const findings = await analyze(code, 'javascript');
    console.log(JSON.stringify(findings, null, 2));

    console.log('\n--- Step 2: Critic ---');
    const reviewed = await critique(code, 'javascript', findings);
    console.log(JSON.stringify(reviewed, null, 2));

    console.log('\n--- Step 3: Improver ---');
    const improved = await improve(code, 'javascript', reviewed);
    console.log(JSON.stringify(improved, null, 2));

    console.log('\n--- Improved code (raw) ---');
    console.log(improved.improvedCode);
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
