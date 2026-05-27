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

// Per-language shell command. Stdin comes from `stdin.txt` via redirection.
// C++ compiles first and exits 70 on compile failure (the compile_error sentinel).
function buildExecCommand(language: SupportedLanguage): string {
    switch (language) {
        case 'python':
            return 'python3 solution.py < stdin.txt';
        case 'cpp':
            // g++ comes from the prebuilt snapshot. Exit 70 = compile-error sentinel (matched in errorReasonFor).
            return 'g++ -O2 -std=c++17 -o solution solution.cpp 2> compile.err || (cat compile.err 1>&2; exit 70) && ./solution < stdin.txt';
    }
}

function sourceFileFor(language: SupportedLanguage): string {
    return language === 'python' ? 'solution.py' : 'solution.cpp';
}

function errorReasonFor(opts: {
    exitCode: number | null;
    timedOut: boolean;
}): ErrorReason {
    if (opts.timedOut)        return 'timeout';
    if (opts.exitCode === 70) return 'compile_error';
    if (opts.exitCode === 0)  return 'ok';
    return 'runtime_error';
}

/**
 * Run one program in a Vercel Sandbox microVM and return its captured output.
 * The sandbox is created and destroyed within this call.
 *
 * Throws only on infrastructure failures (auth, missing token, SDK errors);
 * program-level failures (timeout, runtime/compile error) come back via `errorReason`.
 */
export async function runCode(params: RunParams): Promise<RunResult> {
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must all be set in .env to create a sandbox.');
    }

    // C++ boots from the prebuilt g++ snapshot; everything else from a stock
    // runtime image. The snapshot path omits `runtime` (inherited from the snapshot).
    const useCppSnapshot = params.language === 'cpp' && !!env.VERCEL_CPP_SNAPSHOT_ID;
    if (params.language === 'cpp' && !env.VERCEL_CPP_SNAPSHOT_ID) {
        throw new Error('VERCEL_CPP_SNAPSHOT_ID is not set — run `pnpm tsx src/scripts/build-cpp-snapshot.ts` once and paste the printed ID into .env.');
    }
    // Sandbox lifetime: cold start + exec + slack, so our AbortSignal (not the
    // sandbox-level timeout) is what fires when a program runs over.
    const sandbox = useCppSnapshot
        ? await Sandbox.create({
            token:     env.VERCEL_TOKEN,
            teamId:    env.VERCEL_TEAM_ID,
            projectId: env.VERCEL_PROJECT_ID,
            source:    { type: 'snapshot', snapshotId: env.VERCEL_CPP_SNAPSHOT_ID },
            timeout:   params.timeoutMs + 60_000,
        })
        : await Sandbox.create({
            token:     env.VERCEL_TOKEN,
            teamId:    env.VERCEL_TEAM_ID,
            projectId: env.VERCEL_PROJECT_ID,
            runtime:   RUNTIME_BY_LANGUAGE[params.language],
            timeout:   params.timeoutMs + 60_000,
        });

    try {
        await sandbox.writeFiles([
            { path: sourceFileFor(params.language), content: params.code  },
            { path: 'stdin.txt',                    content: params.stdin },
        ]);

        // AbortSignal enforces the per-program limit; the sandbox `timeout` is a coarser ceiling.
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), params.timeoutMs);
        const startedAt  = Date.now();

        let exitCode: number | null = null;
        let stdout              = '';
        let stderr              = '';
        let timedOut            = false;

        try {
            const result = await sandbox.runCommand({
                cmd:    'sh',
                args:   ['-c', buildExecCommand(params.language)],
                signal: controller.signal,
            });
            exitCode = result.exitCode;
            stdout   = await result.stdout();
            stderr   = await result.stderr();
        } catch (err) {
            // Abort ⇒ our timeout fired. Anything else is infra — surface it.
            if (controller.signal.aborted) {
                timedOut = true;
            } else {
                throw err;
            }
        } finally {
            clearTimeout(timer);
        }

        return {
            stdout:      truncate(stdout),
            stderr:      truncate(stderr),
            exitCode,
            durationMs:  Date.now() - startedAt,
            errorReason: errorReasonFor({ exitCode, timedOut }),
        };
    } finally {
        // Always stop the sandbox — a leaked running VM costs money.
        await sandbox.stop().catch(() => { /* best-effort */ });
    }
}
