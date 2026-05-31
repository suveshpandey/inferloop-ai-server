import { Sandbox } from '@vercel/sandbox';
import { env } from '../config/env.js';
import type { ErrorReason, RunParams, RunResult, SupportedLanguage } from './types.js';

// Vercel Sandbox runtime per language. Python runs in `python3.13` natively;
// C++ runs in `node24` and compiles in-VM via the exec command below.
const RUNTIME_BY_LANGUAGE: Record<SupportedLanguage, string> = {
    python: 'python3.13',
    cpp:    'node24',
};

const MAX_OUTPUT_BYTES = env.SANDBOX_MAX_OUTPUT_KB * 1024;

function truncate(s: string): string {
    return s.length <= MAX_OUTPUT_BYTES
        ? s
        : s.slice(0, MAX_OUTPUT_BYTES) + `\n…[truncated at ${env.SANDBOX_MAX_OUTPUT_KB} KB]`;
}

function sourceFileFor(language: SupportedLanguage): string {
    return language === 'python' ? 'solution.py' : 'solution.cpp';
}

// Compile step run ONCE per batch (null = no compilation needed).
// C++ exits 70 on compile failure so the caller can distinguish compile_error.
function compileCommand(language: SupportedLanguage): string | null {
    switch (language) {
        case 'python': return null;
        case 'cpp':    return 'g++ -O2 -std=c++17 -o solution solution.cpp 2> compile.err || (cat compile.err 1>&2; exit 70)';
    }
}

// Exec step run per test case (reads stdin from stdin.txt).
function execCommand(language: SupportedLanguage): string {
    switch (language) {
        case 'python': return 'python3 solution.py < stdin.txt';
        case 'cpp':    return './solution < stdin.txt';
    }
}

function errorReasonFor(opts: { exitCode: number | null; timedOut: boolean }): ErrorReason {
    if (opts.timedOut)        return 'timeout';
    if (opts.exitCode === 70) return 'compile_error';
    if (opts.exitCode === 0)  return 'ok';
    return 'runtime_error';
}

export type RunBatchParams = {
    language:  SupportedLanguage;
    code:      string;
    inputs:    string[];   // one stdin per test case
    timeoutMs: number;     // per-case timeout
    // Per-case progress hooks for live SSE streaming. Called before/after
    // each input runs; safe to omit when you just want the batch result.
    onCaseStart?:    (caseIndex: number) => void;
    onCaseComplete?: (caseIndex: number, result: RunResult) => void;
};

/**
 * Run the same program against many stdins in ONE sandbox: one cold start, one
 * compile (for C++), N executes. Results are returned in the same order as
 * `inputs`. Drops sandbox creations from N to 1 per batch — critical for the
 * Vercel hobby-tier rate limit (40 sandbox creates / 10 min) and storage.
 *
 * Throws only on infra/auth failures; program-level failures (timeout, runtime
 * error, compile error) come back via `errorReason` on each RunResult.
 */
export async function runCodeBatch(params: RunBatchParams): Promise<RunResult[]> {
    if (params.inputs.length === 0) return [];
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must all be set in .env to create a sandbox.');
    }
    if (params.language === 'cpp' && !env.VERCEL_CPP_SNAPSHOT_ID) {
        throw new Error('VERCEL_CPP_SNAPSHOT_ID is not set — run `pnpm tsx src/scripts/build-cpp-snapshot.ts` once and paste the printed ID into .env.');
    }

    // C++ boots from the prebuilt g++ snapshot; everything else from a stock
    // runtime image. Sandbox lifetime: enough headroom for compile + N execs.
    const useCppSnapshot = params.language === 'cpp' && !!env.VERCEL_CPP_SNAPSHOT_ID;
    const totalBudgetMs  = params.timeoutMs * params.inputs.length + 60_000;
    const sandbox = useCppSnapshot
        ? await Sandbox.create({
            token:     env.VERCEL_TOKEN,
            teamId:    env.VERCEL_TEAM_ID,
            projectId: env.VERCEL_PROJECT_ID,
            source:    { type: 'snapshot', snapshotId: env.VERCEL_CPP_SNAPSHOT_ID },
            timeout:   totalBudgetMs,
        })
        : await Sandbox.create({
            token:     env.VERCEL_TOKEN,
            teamId:    env.VERCEL_TEAM_ID,
            projectId: env.VERCEL_PROJECT_ID,
            runtime:   RUNTIME_BY_LANGUAGE[params.language],
            timeout:   totalBudgetMs,
        });

    try {
        // Write the source file ONCE.
        await sandbox.writeFiles([
            { path: sourceFileFor(params.language), content: params.code },
        ]);

        // Compile ONCE (C++). If it fails, every test case in the batch gets
        // the same compile_error result — no point running them.
        const prep = compileCommand(params.language);
        if (prep) {
            const prepResult = await sandbox.runCommand({ cmd: 'sh', args: ['-c', prep] });
            if (prepResult.exitCode !== 0) {
                const stderr = truncate(await prepResult.stderr());
                // Fire per-case events so the UI doesn't think they're still
                // running — every case immediately fails with the compile error.
                return params.inputs.map((_, i) => {
                    const result: RunResult = {
                        stdout:      '',
                        stderr,
                        exitCode:    prepResult.exitCode,
                        durationMs:  0,
                        errorReason: errorReasonFor({ exitCode: prepResult.exitCode, timedOut: false }),
                    };
                    params.onCaseStart?.(i);
                    params.onCaseComplete?.(i, result);
                    return result;
                });
            }
        }

        // Execute each input. Sequential within the sandbox — cold start is
        // amortized, per-case execs are cheap (~50–500ms for small inputs).
        const exec = execCommand(params.language);
        const results: RunResult[] = [];
        for (let i = 0; i < params.inputs.length; i++) {
            const stdin = params.inputs[i]!;
            params.onCaseStart?.(i);
            await sandbox.writeFiles([{ path: 'stdin.txt', content: stdin }]);

            const controller = new AbortController();
            const timer      = setTimeout(() => controller.abort(), params.timeoutMs);
            const startedAt  = Date.now();

            let exitCode: number | null = null;
            let stdout   = '';
            let stderr   = '';
            let timedOut = false;

            try {
                const r = await sandbox.runCommand({
                    cmd: 'sh', args: ['-c', exec], signal: controller.signal,
                });
                exitCode = r.exitCode;
                stdout   = await r.stdout();
                stderr   = await r.stderr();
            } catch (err) {
                if (controller.signal.aborted) timedOut = true;
                else throw err;
            } finally {
                clearTimeout(timer);
            }

            const result: RunResult = {
                stdout:      truncate(stdout),
                stderr:      truncate(stderr),
                exitCode,
                durationMs:  Date.now() - startedAt,
                errorReason: errorReasonFor({ exitCode, timedOut }),
            };
            results.push(result);
            params.onCaseComplete?.(i, result);
        }
        return results;
    } finally {
        // DELETE (not stop): we never resume a test-execution sandbox, and
        // stop() leaves the snapshot/storage lingering against your quota.
        // delete() frees it immediately. Best-effort — don't fail the run if
        // the delete itself errors.
        await sandbox.delete().catch(() => { /* best-effort */ });
    }
}

/**
 * One-shot wrapper: creates a sandbox, runs a single program against one stdin.
 * Thin wrapper around runCodeBatch — prefer runCodeBatch when you have many
 * inputs against the same code (saves sandbox creations + compile time).
 */
export async function runCode(params: RunParams): Promise<RunResult> {
    const [result] = await runCodeBatch({
        language:  params.language,
        code:      params.code,
        inputs:    [params.stdin],
        timeoutMs: params.timeoutMs,
    });
    return result!;
}
