import type { FieldDef, WizardFormValues } from '../types';

export const MASKED_PLACEHOLDER = '••••••••••••••••••••';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBlank(v: string | undefined): boolean {
  return !v || !v.trim();
}

export function validateUserForm(form: { name: string; email: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (isBlank(form.name)) errors.name = 'Name is required';
  if (isBlank(form.email)) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address';
  return errors;
}

/** Validates the account-name input plus every user-entered field def
 * (skips `kind: 'generated'`, which is a read-only output, never input).
 * `allowMaskedSecret` treats an untouched masked secret field (edit-drawer
 * only — the wizard's fields always start blank) as already valid, since
 * it means "keep the stored value," not "empty." */
export function validateConnectionFields(
  account: string,
  values: WizardFormValues,
  defs: FieldDef[],
  opts?: { allowMaskedSecret?: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (isBlank(account)) errors.account = 'Account name is required';

  for (const def of defs) {
    if (def.kind === 'generated') continue;
    const value = values[def.key];
    if (opts?.allowMaskedSecret && def.secret && value === MASKED_PLACEHOLDER) continue;
    if (isBlank(value)) errors[def.key] = `${def.label} is required`;
  }

  return errors;
}
