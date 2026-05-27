import 'dotenv/config';
import { prisma } from '../db/client.js';
import { createTestCase } from '../db/test-cases.js';
import { executeTestsForRun } from '../services/run-tests.js';

// Checks the test-execution data layer: seed a throwaway user + a run whose
// finalCode doubles its input, attach one passing + one failing case, execute,
// and assert pass-rate is 50. Torn down in `finally`. Needs sandbox creds.

const PROGRAM = 'print(int(input()) * 2)';

async function main() {
    const user = await prisma.user.create({
        data: {
            email:        `test-execute-${Date.now()}@example.com`,
            passwordHash: 'x', // never used — no login in this harness
        },
    });

    const run = await prisma.run.create({
        data: {
            userId:            user.id,
            title:             'execute-tests harness',
            language:          'python',
            code:              PROGRAM,
            finalCode:         PROGRAM,
            maxIterations:     1,
            iterationsRun:     1,
            terminationReason: 'no-findings',
            completedAt:       new Date(),
        },
    });

    try {
        // One passing case (5 → 10) and one failing case (5 → 11).
        await createTestCase(run.id, user.id, { name: 'doubles correctly', input: '5', expectedOutput: '10' });
        await createTestCase(run.id, user.id, { name: 'wrong expectation', input: '5', expectedOutput: '11' });

        console.log('▶ executing tests…');
        const result = await executeTestsForRun(run.id, user.id);

        if (result === null) throw new Error('executeTestsForRun returned null for an owned run');
        console.log(JSON.stringify(result, null, 2));

        if (result.testPassRate !== 50) {
            throw new Error(`expected testPassRate === 50, got ${result.testPassRate}`);
        }
        if (result.results.length !== 2) {
            throw new Error(`expected 2 results, got ${result.results.length}`);
        }

        // Confirm the denormalized column was written.
        const persisted = await prisma.run.findUnique({
            where:  { id: run.id },
            select: { testPassRate: true },
        });
        if (persisted?.testPassRate !== 50) {
            throw new Error(`Run.testPassRate not persisted: got ${persisted?.testPassRate}`);
        }

        console.log('\n✅ all assertions passed (testPassRate === 50, persisted)');
    } finally {
        // Cascade deletes the run's test cases + results; then the user.
        await prisma.run.deleteMany({ where: { id: run.id } });
        await prisma.user.deleteMany({ where: { id: user.id } });
        await prisma.$disconnect();
    }
}

main().catch(async (err) => {
    console.error('Test failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
