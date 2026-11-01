import nodemailer from 'nodemailer';

// Return setting names and safe explanations only, never credentials or provider responses.
export function smtpStatus(env = process.env) {
  const issues = [];
  const placeholder = value => /your[-_ ]|placeholder|change[-_ ]?me|example\.com/i.test(value || '');
  const host = (env.SMTP_HOST || '').trim();
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!host || placeholder(host) || /[\s/@]/.test(host)) issues.push('SMTP_HOST: enter the SMTP server hostname');
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push('SMTP_PORT: enter a port from 1 to 65535');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) issues.push('SMTP_SECURE: use true or false');
  if (!env.SMTP_FROM || placeholder(env.SMTP_FROM) || !/^(?:[^<>\r\n]+\s*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env.SMTP_FROM)) issues.push('SMTP_FROM: enter a valid sender address');
  if ((!local && !env.SMTP_USER) || placeholder(env.SMTP_USER)) issues.push('SMTP_USER: enter the provider username');
  if ((!local && !env.SMTP_PASSWORD) || placeholder(env.SMTP_PASSWORD) || Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) issues.push('SMTP_PASSWORD: enter the provider SMTP password');
  return { configured: issues.length === 0, issues };
}

export function mailTransport() {
  const status = smtpStatus();
  if (!status.configured) throw Object.assign(new Error(status.issues.join('; ')), { status: 503, code: 'SMTP_CONFIG' });
  const host = process.env.SMTP_HOST.trim(), port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({ host, port, secure: port === 465 || process.env.SMTP_SECURE === 'true',
    requireTLS: !['127.0.0.1', 'localhost', '::1'].includes(host),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true });
}

export function mailError(error) {
  const codes = { EDNS: 'EDNS: SMTP hostname could not be resolved', EAUTH: 'EAUTH: SMTP authentication rejected',
    ECONNECTION: 'ECONNECTION: SMTP connection failed', ETIMEDOUT: 'ETIMEDOUT: SMTP connection timed out',
    EENVELOPE: 'EENVELOPE: sender or recipient rejected', EMESSAGE: 'EMESSAGE: message rejected',
    ESOCKET: 'ESOCKET: SMTP socket or TLS failed' };
  return codes[error?.code] || 'SMTP_ERROR: delivery failed; check provider logs';
}

export async function verifySmtp() {
  const transport = mailTransport();
  try { await transport.verify(); return { ok: true, message: 'SMTP connection and authentication succeeded. No email was sent.' }; }
  catch (error) { throw Object.assign(new Error(mailError(error)), { status: 503 }); }
  finally { transport.close(); }
}
