// Edge-compatible (Web Crypto API) signed sender identification cookie & header verification.
// Prevents the sender's own browser from recording self-opens or self-clicks.

export const SENDER_COOKIE_NAME = 'plp_sender_token';

export interface SenderTokenPayload {
  uid?: string;
  email?: string;
  senders?: string[];
  iat: number;
}

function getHmacSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secret) {
    throw new Error('Missing signing key for sender cookie');
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padLen = (4 - (str.length % 4)) % 4;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getHmacSecret());
  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSenderToken(payload: SenderTokenPayload): Promise<string> {
  const cleanPayload: SenderTokenPayload = {
    uid: payload.uid || undefined,
    email: payload.email ? payload.email.toLowerCase().trim() : undefined,
    senders: Array.from(
      new Set(
        (payload.senders || [])
          .map((s) => s.toLowerCase().trim())
          .filter((s) => s && s.includes('@') && s !== 'unknown')
      )
    ).slice(0, 50),
    iat: payload.iat || Date.now(),
  };

  const dataStr = toBase64Url(new TextEncoder().encode(JSON.stringify(cleanPayload)));
  const key = await importHmacKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataStr));
  const sigStr = toBase64Url(new Uint8Array(sigBuf));
  return `${dataStr}.${sigStr}`;
}

export async function verifySenderToken(tokenStr: string): Promise<SenderTokenPayload | null> {
  try {
    const parts = tokenStr.split('.');
    if (parts.length !== 2) return null;
    const [dataStr, sigStr] = parts;
    if (!dataStr || !sigStr) return null;

    const key = await importHmacKey();
    const sigBytes = fromBase64Url(sigStr);
    const dataBytes = new TextEncoder().encode(dataStr);
    const sigCopy = new Uint8Array(sigBytes.length);
    sigCopy.set(sigBytes);

    const valid = await crypto.subtle.verify('HMAC', key, sigCopy, dataBytes);
    if (!valid) return null;

    const jsonStr = new TextDecoder().decode(fromBase64Url(dataStr));
    return JSON.parse(jsonStr) as SenderTokenPayload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (name) {
      try {
        result[name] = decodeURIComponent(val);
      } catch {
        result[name] = val;
      }
    }
  }
  return result;
}

export function buildSenderCookieHeader(signedToken: string): string {
  return `${SENDER_COOKIE_NAME}=${encodeURIComponent(signedToken)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=None`;
}

export function clearSenderCookieHeader(): string {
  return `${SENDER_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

export function parseSenderListHeader(headerValue: string | null): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(',')
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s && s.includes('@') && s !== 'unknown');
}

export async function createMergedSenderCookieHeader(
  request: Request,
  info: { uid?: string | null; email?: string | null; extraSenders?: string[] }
): Promise<string> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const existingRaw = cookies[SENDER_COOKIE_NAME];
  const existing = existingRaw ? await verifySenderToken(existingRaw) : null;

  const headerSenders = parseSenderListHeader(request.headers.get('x-plp-browser-senders'));
  const mergedSenders = new Set<string>([
    ...(existing?.senders || []),
    ...headerSenders,
    ...(info.extraSenders || []),
  ]);
  if (info.email) mergedSenders.add(info.email);
  if (existing?.email) mergedSenders.add(existing.email);

  const token = await signSenderToken({
    uid: info.uid || existing?.uid,
    email: info.email || existing?.email,
    senders: Array.from(mergedSenders),
    iat: Date.now(),
  });
  return buildSenderCookieHeader(token);
}

export async function isRequestFromSender(
  request: Request,
  emailData: { user_id?: string | null; sender_email?: string | null; recipient?: string | null }
): Promise<boolean> {
  const emailSender = (emailData.sender_email || '').toLowerCase().trim();
  const emailRecipient = (emailData.recipient || '').toLowerCase();

  // 1. Check Chrome Extension DNR header (works even if cookies were cleared or in another profile)
  const extSenders = parseSenderListHeader(request.headers.get('x-plp-extension-senders'));
  if (emailSender && emailSender !== 'unknown' && extSenders.includes(emailSender)) {
    return true;
  }

  // 2. Check signed first-party sender cookie
  const cookies = parseCookies(request.headers.get('cookie'));
  const rawToken = cookies[SENDER_COOKIE_NAME];
  if (!rawToken) return false;

  const token = await verifySenderToken(rawToken);
  if (!token) return false;

  const tokenSenders = new Set<string>(
    [...(token.senders || []), token.email || '']
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s && s.includes('@') && s !== 'unknown')
  );

  // Exact sender email match -> definitely the sender
  if (emailSender && emailSender !== 'unknown' && tokenSenders.has(emailSender)) {
    return true;
  }

  // Same PLP dashboard user_id -> sender unless this browser's email is explicitly the recipient of a teammate's email
  if (token.uid && emailData.user_id && token.uid === emailData.user_id) {
    const isBrowserRecipient =
      tokenSenders.size > 0 &&
      Array.from(tokenSenders).some((s) => emailRecipient.includes(s)) &&
      (!emailSender || !tokenSenders.has(emailSender));

    if (!isBrowserRecipient) {
      return true;
    }
  }

  return false;
}
