# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Keel seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to [security@keel-app.dev](mailto:security@keel-app.dev).

You should receive a response within 48 hours. If for some reason you do not, please follow up to ensure we received your original message.

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Preferred Languages

We prefer all communications to be in English.

## Security Measures

Keel implements the following security measures:

### Data Storage

- **Local SQLite Database**: All notes are stored locally in a SQLite database
- **OS Keyring**: API keys and tokens are stored in the operating system's native credential manager:
  - Windows: Windows Credential Manager
  - macOS: Keychain
  - Linux: Secret Service API

### Input Validation

- **HTML Escaping**: All user input is sanitized to prevent XSS attacks
- **Parameterized Queries**: SQL queries use parameterized statements to prevent SQL injection
- **Content Security Policy**: WebView CSP is configured for security

### Network Security

- **HTTPS Only**: All API communications use HTTPS
- **OAuth 2.0**: Google Drive integration uses OAuth 2.0 with PKCE
- **No Telemetry**: Keel does not collect or transmit any usage data

### Build Security

- **Dependency Auditing**: Regular dependency updates and audits
- **Minimal Permissions**: Tauri capabilities are restricted to minimum required permissions

## Disclosure Policy

When we receive a security report, we will:

1. Confirm the vulnerability and determine its impact
2. Audit related code for similar issues
3. Prepare a fix and release it as a patch
4. Publish a security advisory on GitHub

## Security Best Practices for Users

- Keep Keel updated to the latest version
- Do not share your `.env` file or API credentials
- Use a strong, unique password for your Google account
- Enable two-factor authentication on your Google account
- Regularly backup your notes using the snapshot feature

## Bug Bounty

We do not currently have a bug bounty program, but we greatly appreciate any help in making Keel more secure. Contributors who report valid security vulnerabilities will be acknowledged in our security advisories (unless they prefer to remain anonymous).

## Contact

For any security-related questions, please contact [security@keel-app.dev](mailto:security@keel-app.dev).
