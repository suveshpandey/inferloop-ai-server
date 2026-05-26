import { Sandbox } from '@vercel/sandbox';
import { env } from '../config/env.js';
import type { ErrorReason, RunParams, RunResult, SupportedLanguage } from './types.js';

// One Vercel Sandbox runtime per language. The SDK exposes `python3.13`
// natively, so Python needs no extra install step. C++ runs in `node24`
// (Amazon Linux 2023 base) where `g++` is preinstalled — the runner
// compiles inside the VM via `sh -c "g++ ... && ./a.out"`.
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

// Per-language shell command. Stdin is fed via shell redirection from
// `stdin.txt` written into the sandbox's working dir. For C++ we compile
// first and bail out with a sentinel exit code on compile failure so the
// caller can distinguish compile_error from runtime_error.
function buildExecCommand(language: SupportedLanguage): string {
    switch (language) {
        case 'python':
            return 'python3 solution.py < stdin.txt';
        case 'cpp':
            // g++ is preinstalled via the snapshot built by
            // src/scripts/build-cpp-snapshot.ts.
            // Exit code 70 = compile error sentinel (arbitrary, > standard
            // signal range). Matched in errorReasonFor below.
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
 * Execute a single program in a Vercel Sandbox microVM and return its
 * captured output. The sandbox is created and destroyed inside this call —
 * no instance reuse across runs yet (Sub-phase 2.2 will batch).
 *
 * Throws only on infrastructure failures (auth, missing token, SDK errors).
 * Program-level failures (timeout, runtime error, compile error) are
 * surfaced via `errorReason` in the returned result.
 */
export async function runCode(params: RunParams): Promise<RunResult> {
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must all be set in .env to create a sandbox.');
    }

    // C++ boots from a prebuilt snapshot that has g++ installed; everything
    // else boots from a stock runtime image. The snapshot path omits
    // `runtime` (it's inherited from the snapshot).
    const useCppSnapshot = params.language === 'cpp' && !!env.VERCEL_CPP_SNAPSHOT_ID;
    if (params.language === 'cpp' && !env.VERCEL_CPP_SNAPSHOT_ID) {
        throw new Error('VERCEL_CPP_SNAPSHOT_ID is not set — run `pnpm tsx src/scripts/build-cpp-snapshot.ts` once and paste the printed ID into .env.');
    }
    // Sandbox lifetime: enough headroom for cold start + the execute step +
    // a little slack so the abort signal (not the sandbox-level timeout)
    // is what fires when the program runs over.
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

        // AbortSignal is what enforces the per-program time limit. The
        // sandbox-level `timeout` above is a coarser ceiling.
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
            // AbortError ⇒ we hit our own timeout. Anything else is an
            // infrastructure problem we want surfaced.
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
        // Always stop the sandbox, even if writeFiles or runCommand threw —
        // leaking a running VM costs money.
        await sandbox.stop().catch(() => { /* best-effort */ });
    }
}
