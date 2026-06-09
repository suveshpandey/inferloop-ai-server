// Map a thrown error to a coarse category the client can render differently.
//
// 'transient' = retrying in a few seconds is likely to succeed (cold-start of
//               Neon DB, sandbox quota wake-up, momentary fetch hiccup).
// 'persistent' = something is actually broken (bad LLM response, invalid input,
//                permanent sandbox/LLM outage).

export type ErrorCategory = 'transient' | 'persistent';

export type ClassifiedError = {
    code:    ErrorCategory;
    message: string;
};

/** User-facing messages — short, plain, actionable. */
const TRANSIENT_MESSAGE =
    'The service is waking up after some idle time. Please try again in a few seconds.';
const PERSISTENT_MESSAGE =
    'Review failed — one of the pipeline agents returned an invalid response or is unavailable. Try again, and if it keeps failing, report the issue.';

/**
 * Prisma transaction timeout codes that indicate the DB took too long to hand
 * out a connection. P2028 is the modern code; the older runtimes throw with a
 * recognisable message instead.
 */
function isPrismaTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const code = (err as { code?: unknown }).code;
    if (code === 'P2028' || code === 'P1001' || code === 'P1002' || code === 'P1008' || code === 'P1017') {
        return true;
    }
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
        if (message.includes('Unable to start a transaction in the given time')) return true;
        if (message.includes("Can't reach database server"))                      return true;
        if (message.includes('Server has closed the connection'))                 return true;
        if (message.includes('Connection terminated unexpectedly'))               return true;
    }
    return false;
}

/** Node `fetch` / undici / TCP errors that retry usually fixes. */
function isNetworkTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const code = (err as { code?: unknown }).code;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN'  || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_SOCKET') {
        return true;
    }
    const cause = (err as { cause?: unknown }).cause;
    if (cause && cause !== err) return isNetworkTransientError(cause);
    return false;
}

/** Vercel Sandbox throws with a 5xx-ish status when the platform is busy. */
function isSandboxTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const status = (err as { status?: unknown; statusCode?: unknown }).status
                ?? (err as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 500 && status < 600) return true;
    if (typeof status === 'number' && status === 429)                return true;
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
        if (message.toLowerCase().includes('sandbox') &&
            (message.includes('unavailable') || message.includes('timeout') || message.includes('temporarily'))) {
            return true;
        }
    }
    return false;
}

export function classifyError(err: unknown): ClassifiedError {
    const transient =
        isPrismaTransientError(err)   ||
        isNetworkTransientError(err)  ||
        isSandboxTransientError(err);

    return transient
        ? { code: 'transient',  message: TRANSIENT_MESSAGE  }
        : { code: 'persistent', message: PERSISTENT_MESSAGE };
}
