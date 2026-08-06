import type { webcrypto } from 'node:crypto';
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose';
import type { SessionClaims } from '@cirrus/shared-types';
import { env } from './env.js';

const KID = 'cirrus-auth-1';

let privateKey: webcrypto.CryptoKey;
let publicJwk: JWK;

export async function initSigningKey() {
  if (env.signingKeyJwk) {
    const jwk = JSON.parse(env.signingKeyJwk) as JWK;
    privateKey = (await importJWK(jwk, 'ES256')) as webcrypto.CryptoKey;
    const { d, ...pub } = jwk;
    publicJwk = { ...pub, kid: KID, alg: 'ES256', use: 'sig' };
    return;
  }

  const { privateKey: priv, publicKey: pub } = await generateKeyPair('ES256', { extractable: true });
  privateKey = priv;
  publicJwk = { ...(await exportJWK(pub)), kid: KID, alg: 'ES256', use: 'sig' };
  console.warn(
    'AUTH: no AUTH_SIGNING_KEY_JWK provided — generated an ephemeral signing key for this process. ' +
      'All sessions will be invalidated on restart; set AUTH_SIGNING_KEY_JWK for a stable key.',
  );
}

export function getJwks() {
  return { keys: [publicJwk] };
}

export async function signSession(input: {
  oid: string;
  tid: string;
  name: string;
  preferredUsername: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Omit<SessionClaims, 'iat' | 'exp' | 'jti' | 'iss' | 'aud'> = {
    sub: input.oid,
    oid: input.oid,
    tid: input.tid,
    name: input.name,
    preferred_username: input.preferredUsername,
  };

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setIssuedAt(now)
    .setIssuer(env.jwtIssuer)
    .setAudience(env.jwtAudience)
    .setExpirationTime(now + env.sessionTtlSeconds)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

/**
 * Mints a short-lived JWT for GCP Workload Identity Federation — a second
 * token kind alongside signSession, sharing the same signing key/KID (so the
 * one JWKS endpoint validates both). `sub` is the connectionId (not a fixed
 * constant) so a GCP-side trust policy can scope down to
 * `principal://.../subject/{connectionId}` for defense in depth. `audience`
 * is the per-connection WIF resource name
 * (`//iam.googleapis.com/projects/{number}/locations/global/workloadIdentityPools/{poolId}/providers/{providerId}`),
 * built by the caller from that connection's own config.
 */
export async function signWifToken(input: { connectionId: string; audience: string; ttlSeconds?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 300;

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setSubject(input.connectionId)
    .setIssuedAt(now)
    .setIssuer(env.jwtIssuer)
    .setAudience(input.audience)
    .setExpirationTime(now + ttl)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}
