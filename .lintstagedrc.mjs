export default {
  'frontend/**/*.{ts,tsx}': [
    'frontend/node_modules/.bin/oxlint --config frontend/.oxlintrc.json',
    () => 'npm run typecheck --prefix frontend',
  ],
  'backend/**/*.ts': [
    () => 'npm run build --prefix backend',
  ],
  'backend/collectors/**/*.go': [
    'bash scripts/gofmt-check.sh',
    () => 'bash scripts/go-vet-check.sh',
  ],
};
