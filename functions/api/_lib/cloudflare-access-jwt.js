const encoder = new TextEncoder();
const certsCache = new Map();
const CERTS_TTL_MS = 5 * 60 * 1000;

function readEnv(context, ...keys) {
  for (const key of keys) {
    const value = String(context?.env?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

export function accessTeamDomain(context) {
  const raw = readEnv(context, 'CF_ACCESS_TEAM_DOMAIN', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN');
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.cloudflareaccess\.com$/i, '')
    .trim();
}

export function accessAudience(context) {
  return readEnv(context, 'CF_ACCESS_AUD', 'CLOUDFLARE_ACCESS_AUD');
}

export function accessCertsUrl(context, teamDomain = accessTeamDomain(context)) {
  const override = readEnv(context, 'CF_ACCESS_CERTS_URL', 'CLOUDFLARE_ACCESS_CERTS_URL');
  if (override) return override;
  if (!teamDomain) return '';
  return `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? normalized : normalized + '='.repeat(4 - (normalized.length % 4));
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? local.slice(0, 1) : `${local.slice(0, 1)}***`;
  return `${visible}@${domain}`;
}

async function fetchAccessCerts(url) {
  const cached = certsCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CERTS_TTL_MS) return cached.keys;
  const response = await fetch(url, { cf: { cacheTtl: 300 } });
  if (!response.ok) throw new Error(`Access certs fetch failed (${response.status})`);
  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  certsCache.set(url, { fetchedAt: Date.now(), keys });
  return keys;
}

async function importRsaVerifyKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function verifyAccessJwtAssertion(context, jwtAssertion) {
  const token = String(jwtAssertion || '').trim();
  if (!token) return { email: null, error: 'missing_jwt' };

  const teamDomain = accessTeamDomain(context);
  if (!teamDomain) return { email: null, error: 'missing_team_domain' };

  const parts = token.split('.');
  if (parts.length !== 3) return { email: null, error: 'invalid_jwt_format' };

  let header;
  let payload;
  try {
    header = decodeJsonSegment(parts[0]);
    payload = decodeJsonSegment(parts[1]);
  } catch {
    return { email: null, error: 'invalid_jwt_json' };
  }

  const expectedIssuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== expectedIssuer) return { email: null, error: 'invalid_issuer' };

  const configuredAud = accessAudience(context);
  if (configuredAud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.filter(Boolean).includes(configuredAud)) {
      return { email: null, error: 'invalid_audience' };
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) <= now) return { email: null, error: 'expired' };
  if (payload.nbf && Number(payload.nbf) > now) return { email: null, error: 'not_yet_valid' };

  const certsUrl = accessCertsUrl(context, teamDomain);
  if (!certsUrl) return { email: null, error: 'missing_certs_url' };

  let keys;
  try {
    keys = await fetchAccessCerts(certsUrl);
  } catch {
    return { email: null, error: 'certs_fetch_failed' };
  }

  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA') return { email: null, error: 'unknown_key' };

  let signatureValid = false;
  try {
    const publicKey = await importRsaVerifyKey(jwk);
    signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return { email: null, error: 'verify_failed' };
  }

  if (!signatureValid) return { email: null, error: 'invalid_signature' };

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email.includes('@')) return { email: null, error: 'missing_email_claim' };

  return { email, error: null };
}

export function getDirectAccessEmail(context) {
  const email = String(context?.request?.headers?.get('Cf-Access-Authenticated-User-Email') || '').trim();
  return email.includes('@') ? email.toLowerCase() : null;
}

export function hasAccessEmailHeader(context) {
  return Boolean(getDirectAccessEmail(context));
}

export function hasAccessJwtHeader(context) {
  return Boolean(String(context?.request?.headers?.get('Cf-Access-Jwt-Assertion') || '').trim());
}

export async function resolveCloudflareAccessEmailFromJwt(context) {
  const jwt = context?.request?.headers?.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
  const verified = await verifyAccessJwtAssertion(context, jwt);
  return verified.email;
}

export async function resolveCloudflareAccessEmail(context) {
  const direct = getDirectAccessEmail(context);
  if (direct) return direct;
  return resolveCloudflareAccessEmailFromJwt(context);
}

export async function describeAccessIdentity(context) {
  const direct = getDirectAccessEmail(context);
  let resolved = direct;
  if (!resolved && hasAccessJwtHeader(context)) {
    resolved = await resolveCloudflareAccessEmailFromJwt(context);
  }
  return {
    hasAccessEmailHeader: Boolean(direct),
    hasAccessJwtHeader: hasAccessJwtHeader(context),
    resolvedEmailMasked: resolved ? maskEmail(resolved) : null,
  };
}

export function clearAccessCertsCacheForTests() {
  certsCache.clear();
}
