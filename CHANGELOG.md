# Changelog

All notable changes to Pluryfact are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned for 0.2.0, after the Chrome Web Store approves 0.1.0. In development:
it needs Pluryprint 0.0.6, which must ship both the native host
(MAECLY/pluryprint#104) and XML printing (MAECLY/pluryprint#103).

### Added

- **Print with Pluryprint** (Windows and macOS): send the RIDE PDFs, the
  authorised XML (Pluryprint renders a RIDE-like printout from it) or both, plus
  the optional TXT report, to the Pluryprint desktop app over Chrome Native
  Messaging. Files travel as validated bytes in 8 MiB chunks with a SHA-256
  each; nothing goes over the network and no paths are shared.
- **Integrations** tab, with one card per MAECLY tool (Pluryprint today) and
  its own settings below it. Integrations → Pluryprint: connect (asks for the optional permission and greets
  the host), what to print, XML when a RIDE is missing, report, order (issue
  date, issuer, type or portal order), what Pluryprint does (open to review and
  confirm by default, queue, or print directly with a confirmation above 50
  documents), profile, printer, copies, duplex and colour.
- New download: "Send to Pluryprint when done", which turns on the formats the
  chosen printout needs (printing XML only does not require the slower RIDE
  download).
- Downloads: "Print a ZIP…" for any past `pluryfact_*.zip` (unzipped inside the
  extension, hostile paths ignored), "Print with Pluryprint" for the last job
  while the SRI tab still holds it, and a summary ("3 RIDE + 1 XML + the
  report") before confirming. Each job shows how its Pluryprint delivery went.
- Sidebar indicator "Pluryprint: connected / not connected / not installed /
  no permission / no response / update it / problems" (the full message is in
  the tooltip).
- `bun run e2e:pluryprint`: end-to-end test in Chromium with a native host
  (a fake one, or the real bridge via `PLURYPRINT_BRIDGE_BIN`).

### Changed

- `nativeMessaging` is declared as an **optional** permission, requested only
  when the user connects Pluryprint, so updating does not disable Pluryfact for
  anyone else.
- About: "Everything happens in your browser" and "Only talks to the SRI" now
  read "Everything happens on your computer" and "On the internet, it only talks
  to the SRI", and the permissions table lists the optional one.

[Unreleased]: https://github.com/MAECLY/pluryfact/compare/v0.1.0...HEAD

## [0.1.0] - 2026-11-14

First public version, submitted to the Chrome Web Store.

### Added

- Bulk download of received and issued electronic documents from SRI en Línea,
  inside the user's own signed-in tab: authorised XML, RIDE (PDF) and the TXT
  report, packed into one ZIP sorted as
  `pluryfact/<RUC>/<received|issued>/<year>/<month>/`.
- Periods by day, date range, month or whole year; invoices, withholdings,
  credit notes, debit notes and purchase settlements; issuer filter by RUC or
  business name on received documents.
- Few queries on purpose: one per month for received documents (12 for a
  year), one per day for issued ones, which the portal requires.
- XML from the SRI's public authorisation web service, with retries and a
  fallback to the portal's own XML link when the web service has none.
- Queries driven through the portal's own controls (Consultar and the pager),
  so the ViewState, PrimeFaces updates and the reCAPTCHA stay the SRI's. If the
  SRI asks for a captcha, the job pauses and the user solves it.
- Expired-session detection that keeps what was downloaded and offers
  **Resume** for only what is missing.
- Popup with a filing-cabinet month strip, live progress, toolbar badge and
  notifications when a job ends, the session expires or something fails.
- Full page with New download, Downloads history (grouped by date, search and
  filters), Advanced settings (query pace, notifications, history length,
  diagnostic log, delete data) and About.
- Eight colour and type themes (Pluryfact, Tabularium, Ledgera, Factrix,
  XMLote, Comproflow, Comprobox, Fiscabox), in light and dark.
- A masked diagnostic log (RUCs and access keys hidden) the user can copy or
  download to report a problem.
- No servers, no accounts, no analytics: everything happens between the
  browser and the SRI.

[0.1.0]: https://github.com/MAECLY/pluryfact/releases/tag/v0.1.0
