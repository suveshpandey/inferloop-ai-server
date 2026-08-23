import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

// Lazy singleton. Returns null when email is disabled or SMTP is unconfigured,
// so callers can no-op cleanly in local dev without throwing.
let cached: Transporter | null | undefined;

export function getTransport(): Transporter | null {
    if (cached !== undefined) return cached;

    const configured = env.EMAIL_ENABLED && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS;
    if (!configured) {
        cached = null;
        return cached;
    }

    cached = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        // 465 = implicit TLS; anything else (587) uses STARTTLS.
        secure: env.SMTP_PORT === 465,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    });

    return cached;
}

// Boot-time credential check. Safe to call always — resolves false when disabled.
export async function verifyTransport(): Promise<boolean> {
    const transport = getTransport();
    if (!transport) return false;
    await transport.verify();
    return true;
}
