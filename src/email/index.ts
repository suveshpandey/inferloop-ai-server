import { env } from '../config/env.js';
import { getTransport, verifyTransport } from './transport.js';
import { welcomeEmail } from './templates/welcome.js';

export { verifyTransport };

export interface SendMailParams {
    to: string;
    subject: string;
    html: string;
    text: string;
}

// Low-level send. Best-effort: never throws to the caller — logs and returns a
// boolean so upstream flows (like signup) can't be broken by email failures.
export async function sendMail({ to, subject, html, text }: SendMailParams): Promise<boolean> {
    const transport = getTransport();
    if (!transport) {
        console.log(`[email] skipped (disabled/unconfigured) → "${subject}" to ${to}`);
        return false;
    }

    try {
        await transport.sendMail({
            from: `${env.BRAND_NAME} <${env.SMTP_FROM}>`,
            to,
            subject,
            html,
            text,
            headers: {
                'List-Unsubscribe': `<mailto:${env.SMTP_FROM}?subject=unsubscribe>`,
            },
        });
        console.log(`[email] sent "${subject}" to ${to}`);
        return true;
    } catch (err) {
        console.error(`[email] failed "${subject}" to ${to}:`, err);
        return false;
    }
}

export async function sendWelcomeEmail(to: string, username?: string): Promise<boolean> {
    const { subject, html, text } = welcomeEmail({
        username,
        brand: env.BRAND_NAME,
        appUrl: env.APP_URL,
    });
    return sendMail({ to, subject, html, text });
}
