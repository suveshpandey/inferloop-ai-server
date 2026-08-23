export interface WelcomeEmailParams {
    username?: string;
    brand: string;
    appUrl: string;
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export function welcomeEmail({ username, brand, appUrl }: WelcomeEmailParams): RenderedEmail {
    const greetingName = username?.trim() || 'there';
    const reviewUrl = `${appUrl.replace(/\/$/, '')}/review`;
    const subject = `Welcome to ${brand} — let's get started`;

    const text = [
        `Hi ${greetingName},`,
        '',
        `Welcome to ${brand} — your multi-agent code reviewer.`,
        '',
        'Here\'s how it works:',
        '  1. Paste your code solution',
        '  2. Our four AI agents — Analyzer, Critic, Improver & Evaluator — review it',
        '  3. They iterate against real test cases until the solution converges',
        '',
        `Start your first review: ${reviewUrl}`,
        '',
        `— The ${brand} team`,
        '',
        `You're receiving this because you signed up at ${brand}.`,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${subject}</title>
    <!--[if mso]>
    <style>table,td{font-family:Arial,Helvetica,sans-serif!important}</style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

    <!-- Outer wrapper: light background, generous mobile padding -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
      <tr>
        <td align="center" style="padding:48px 24px;">

          <!-- Card: max-width container -->
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

            <!-- Brand accent bar -->
            <tr>
              <td style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa);border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <!-- Card body -->
            <tr>
              <td style="background-color:#18181b;border-left:1px solid #27272a;border-right:1px solid #27272a;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                  <!-- Logo / Brand -->
                  <tr>
                    <td style="padding:36px 40px 0 40px;">
                      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.025em;">${brand}</p>
                    </td>
                  </tr>

                  <!-- Heading -->
                  <tr>
                    <td style="padding:28px 40px 0 40px;">
                      <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;font-weight:600;">Welcome, ${greetingName}</h1>
                    </td>
                  </tr>

                  <!-- Body copy -->
                  <tr>
                    <td style="padding:16px 40px 0 40px;">
                      <p style="margin:0;font-size:15px;line-height:1.7;color:#a1a1aa;">
                        Your account is ready. <strong style="color:#e4e4e7;">${brand}</strong> is a multi-agent code reviewer that analyzes your solutions and iterates on them until they converge.
                      </p>
                    </td>
                  </tr>

                  <!-- How it works -->
                  <tr>
                    <td style="padding:24px 40px 0 40px;">
                      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">How it works</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding:8px 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                              <td style="width:28px;vertical-align:top;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background-color:#27272a;color:#a78bfa;font-size:12px;font-weight:700;">1</span></td>
                              <td style="vertical-align:top;padding-left:10px;font-size:14px;line-height:1.5;color:#d4d4d8;">Paste your code solution</td>
                            </tr></table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                              <td style="width:28px;vertical-align:top;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background-color:#27272a;color:#a78bfa;font-size:12px;font-weight:700;">2</span></td>
                              <td style="vertical-align:top;padding-left:10px;font-size:14px;line-height:1.5;color:#d4d4d8;">Four AI agents — <strong style="color:#e4e4e7;">Analyzer, Critic, Improver & Evaluator</strong> — review it</td>
                            </tr></table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                              <td style="width:28px;vertical-align:top;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background-color:#27272a;color:#a78bfa;font-size:12px;font-weight:700;">3</span></td>
                              <td style="vertical-align:top;padding-left:10px;font-size:14px;line-height:1.5;color:#d4d4d8;">They iterate against real test cases until convergence</td>
                            </tr></table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- CTA Button -->
                  <tr>
                    <td style="padding:32px 40px 0 40px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="background-color:#6366f1;border-radius:8px;">
                            <a href="${reviewUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">Start your first review &rarr;</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Spacer before footer -->
                  <tr>
                    <td style="padding:36px 0 0 0;"></td>
                  </tr>

                </table>
              </td>
            </tr>

            <!-- Card footer -->
            <tr>
              <td style="background-color:#141415;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#52525b;">
                  You're receiving this because you signed up for ${brand}. If this wasn't you, you can safely ignore this email.
                </p>
              </td>
            </tr>

          </table>

          <!-- Sub-footer: outside the card -->
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
            <tr>
              <td style="padding:24px 40px 0 40px;text-align:center;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">
                  &copy; ${new Date().getFullYear()} ${brand} &middot; All rights reserved
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

  </body>
</html>`;

    return { subject, html, text };
}
