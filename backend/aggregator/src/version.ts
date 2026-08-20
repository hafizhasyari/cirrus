import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read once at boot from this service's own package.json (already shipped
// in the final Docker image alongside dist/ — see Dockerfile's COPY steps)
// rather than a separate env var, so there's exactly one place — kept in
// sync across all 10 first-party services by scripts/bump-version.sh — that
// can drift.
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
export const version: string = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
