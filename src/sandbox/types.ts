// Closed-set vocabulary so the UI and DB don't parse SDK-specific strings.
// - 'ok'            — exited 0 within the time limit.
// - 'timeout'       — exceeded `timeoutMs`; sandbox aborted (may have partial stdout).
// - 'runtime_error' — non-zero exit (uncaught exception, segfault, etc).
// - 'compile_error' — C++ compile step failed (never for Python).
// - 'sandbox_error' — infra failure (Vercel API down, etc), distinct from program errors.
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
