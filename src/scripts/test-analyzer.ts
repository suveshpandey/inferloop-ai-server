import 'dotenv/config';
import { analyze } from '../agents/analyzer.js';

const code = `
function divide(a, b) {
  return a / b;
}
console.log(divide(10, 0));
`;

async function main() {
  const result = await analyze(code, 'javascript');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});