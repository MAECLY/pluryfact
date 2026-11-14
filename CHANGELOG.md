# Changelog

All notable changes to Pluryfact are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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
