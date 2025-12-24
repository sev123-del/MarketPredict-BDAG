# Privacy (GDPR-oriented)

This repository aims to minimize collection and retention of personal data.

## What data is stored

### In your browser (local-only)

- `mp_user_settings` (username and display preferences)
- `mp_avatar_pref` (avatar style preference)
- `mp_portfolio_cache` (portfolio/cache data if enabled by features)

This data stays on the user’s device and is not automatically synced to a server.

### On the server (transient)

- Rate limiting / abuse protection may store short-lived identifiers (e.g., IP-derived keys) in Redis or in-memory.
- These entries are designed to expire automatically (time-window based) and are not intended for long-term tracking.

## “Right to be forgotten” (data deletion)

Because most user data is stored locally in the browser, the primary deletion mechanism is local deletion:

- In the Profile page, use the "Clear local data" button.
- Or manually clear site data in the browser (Local Storage for this domain).

If server-side storage is introduced later (accounts, profiles, analytics), the project should add:

- A documented retention period
- A deletion endpoint/process
- A way to request deletion tied to an authenticated identifier

## Logging guidelines

- Avoid logging full URLs, wallet addresses, IPs, or CSP reports.
- If logs are needed for debugging, prefer redaction/truncation and keep retention short.

## Contact

If you operate a hosted instance, add a contact method here for privacy requests.
