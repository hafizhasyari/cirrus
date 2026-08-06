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
