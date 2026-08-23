import 'dotenv/config';
import { env } from '../config/env.js';
import { verifyTransport, sendWelcomeEmail } from '../email/index.js';

// Usage: pnpm tsx src/scripts/test-email.ts <recipient@email.com> [username]
async function main() {
    const to = process.argv[2];
    const username = process.argv[3];

    if (!to) {
        console.error('Usage: pnpm tsx src/scripts/test-email.ts <recipient@email.com> [username]');
        process.exit(1);
    }

    console.log(`EMAIL_ENABLED=${env.EMAIL_ENABLED}  from=${env.SMTP_FROM}  host=${env.SMTP_HOST}:${env.SMTP_PORT}`);

    try {
        const ok = await verifyTransport();
        console.log(ok ? '✓ SMTP transport verified' : '• transport disabled/unconfigured (no real send will happen)');
    } catch (err) {
        console.error('✗ SMTP verify failed:', err);
    }

    const sent = await sendWelcomeEmail(to, username);
    console.log(sent ? `✓ Welcome email sent to ${to}` : `• Welcome email not sent to ${to}`);
    process.exit(sent ? 0 : 1);
}

main();
