# Changelog

All notable changes to Cirrus are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
the lockstep scheme described in `CLAUDE.md`'s "Versioning" section.

History before 1.0.2 predates this file — see `git log` and the `v1.0.0`/
`v1.0.1` tags for that period.

## [1.0.2] - 2026-08-22

### Fixed
- Inventory's refresh progress indicator ("Refreshing X/Y connections…") now
  counts only the connections a Viewer is actually assigned to, instead of
  every connection in the system.
- Inventory's "Providers connected" stat card now reflects a Viewer's own
  assigned connections instead of always showing 0.
- A Viewer no longer sees outage banners (e.g. "X not responding") for cloud
  providers they have no connection to.
