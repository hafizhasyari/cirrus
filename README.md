# Cirrus — Cloud VM Inventory Dashboard

Cirrus is an internal dashboard that shows all of the company's cloud virtual machines — across **AWS, GCP, Alibaba Cloud, OCI, and Biznet Gio Cloud** — in one place. It's read-only inventory: no cost/billing data, no ability to start, stop, or change any VM. Its job is simply to make it easy to see what's running, where, and how much of it there is.

## Who it's for

Cirrus has two roles:

- **Admin** — sees inventory across every registered cloud account, registers/manages the cloud provider connections Cirrus pulls data from, and manages who else has access.
- **Viewer** — sees inventory only for the cloud accounts they've been assigned to.

Access is invite-only. If you don't have an account yet, ask your Admin to invite you.

## Signing in

Cirrus uses your company Microsoft account (the same one you use for Outlook/Teams) — there's no separate Cirrus password to remember. Open the app and sign in with Microsoft; if your account hasn't been invited yet, you'll need to ask an Admin first.

## What you can do

**Everyone:**
- Browse the full VM inventory — name, cloud provider, account, region, status (running/stopped), type, CPU, memory, disk, and IP address.
- Search and filter the list, and sort any column.
- Click into a VM for its full detail view, including per-disk storage info.
- Refresh the inventory on demand to pull the latest data from each cloud account.

**Admins, additionally:**
- Register a new cloud account connection (each provider's setup guide is shown right in the wizard) and see its health/connection status.
- Edit or remove existing connections.
- Invite new users, assign their role and which accounts they can view, and manage existing users.

## Getting help

If you can't sign in, don't see the accounts you expect, or notice something wrong with the data shown, contact your Cirrus Admin or your IT team.

## For developers

Looking to build, deploy, or contribute to Cirrus? See [`DEVELOPMENT.md`](DEVELOPMENT.md) for setup, architecture, and contribution guidelines — and [`PRD.md`](PRD.md) / [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`TODO.md`](TODO.md) for deeper product and technical detail.
