// Closed-set vocabulary so the UI and DB don't have to parse SDK-specific
// strings. New reasons get added here and to the dispatcher in runner.ts.
//
// - 'ok'             — program exited 0 within the time limit.
// - 'timeout'        — wall-clock execution exceeded `timeoutMs`; the sandbox
//                      was aborted. May still have partial stdout.
// - 'runtime_error'  — program exited with a non-zero code (uncaught
//                      exception, segfault, divide-by-zero, etc).
// - 'compile_error'  — reserved for C++ (compile step fails before execute).
//                      Never returned for Python.
// - 'sandbox_error'  — infrastructure failure (Vercel API down, missing
//                      runtime, etc). Distinct from program errors so the
//                      caller can decide whether to retry vs. fail the test.
export type ErrorReason =
    | 'ok'
    | 'timeout'
    | 'runtime_error'
    | 'compile_error'
    | 'sandbox_error';

export type SupportedLanguage = 'python' | 'cpp';

export type RunParams = {
    language:   SupportedLanguage;
    code:       string;
    /** Piped to the program's stdin. Empty string ⇒ no stdin. */
    stdin:      string;
    /** Wall-clock budget for the *execute* step (not including sandbox
     *  startup). Defaults to env.SANDBOX_TIMEOUT_MS at the caller. */
    timeoutMs:  number;
};

export type RunResult = {
    /** Captured stdout, truncated to env.SANDBOX_MAX_OUTPUT_KB. */
    stdout:      string;
    /** Captured stderr, truncated to env.SANDBOX_MAX_OUTPUT_KB. */
    stderr:      string;
    /** Null if the process was killed before exiting (e.g. timeout). */
    exitCode:    number | null;
    /** Time the program spent executing, measured from process start to
     *  exit/abort. Does NOT include sandbox cold start. */
    durationMs:  number;
    errorReason: ErrorReason;
};
