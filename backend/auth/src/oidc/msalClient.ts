import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { env } from '../env.js';

export const SCOPES = ['openid', 'profile'];

export const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: env.entraClientId,
    authority: `https://login.microsoftonline.com/${env.entraTenantId}`,
    clientSecret: env.entraClientSecret,
  },
});

export const cryptoProvider = new CryptoProvider();
