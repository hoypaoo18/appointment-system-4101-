import { mailTransport } from './mail.mjs';
import { isProduction } from './config.mjs';
import { emailConfigured } from './notifications.mjs';

export function verificationOrigin(req) {
  if (isProduction()) return process.env.PUBLIC_ORIGIN;
  // Never build account emails from an arbitrary Host header.
  const origin = req.headers.origin;
  if (origin) {
    const url = new URL(origin);
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)) return url.origin;
  }
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw Object.assign(new Error('Use the configured application address'), { status: 400 });
  return `${req.socket.encrypted ? 'https' : 'http'}://${host}`;
}

export async function deliverVerification(email, token, origin) {
  const url = `${origin}/#verify=${token}`;
  if (!emailConfigured()) {
    if (isProduction()) throw Object.assign(new Error('Client registration requires email delivery. Please contact the office.'), { status: 503 });
    return { developmentVerificationUrl: url };
  }
  const transport = mailTransport();
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM, to: email,
      subject: 'Verify your Meridian client account',
      text: `Verify your email to book appointments:\n\n${url}\n\nThis link expires in 24 hours. If you did not request this account, ignore this message.`,
    });
    return {};
  } catch {
    throw Object.assign(new Error('Unable to send verification email. Please try Resend verification shortly.'), { status: 503 });
  } finally { transport.close(); }
}
