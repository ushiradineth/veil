# Security Policy

## Supported Versions

The following versions of Veil are currently supported with security updates:

| Version | Supported |
|---------|------------|
| 0.1.x   | ✅ Yes     |

## Reporting a Vulnerability

If you believe you have found a security vulnerability in Veil, please report it to us through coordinated disclosure.

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please send an email to security@veil.dev with the following information:

- The type of issue (e.g., buffer overflow, SQL injection, or cross-site scripting)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Data Handling and Privacy

Veil is a local-first MCP server that indexes and searches code on your machine. Here's how it handles data:

### Local Processing
- All indexing and search operations run locally on your machine
- No code or data is sent to external servers during normal operation
- The index is stored in `.veil/` or `.agents/index/` directories in your workspace

### External Calls
Veil makes external calls only when explicitly requested:
- Web search: Only when you use `web_search` tools
- URL fetching: Only when you use `fetch_url` tools
- GitHub lookups: Only when you use GitHub-related tools

### Data Storage
- Index data is stored locally and never transmitted
- No telemetry or analytics are collected
- No personal data is sent to any external service

## Security Best Practices

### For Users
- Keep Veil updated to the latest version
- Review the source code before running in production environments
- Use appropriate file permissions on your workspace
- Be cautious when using web search and URL fetching features with sensitive data

### For Developers
- Follow secure coding practices when contributing
- Use dependency pinning in package.json
- Run security audits regularly: `npm audit`
- Keep dependencies updated

## Dependency Security

Veil uses the following security practices for dependencies:

- All dependencies are pinned to specific versions
- Regular security audits are run on dependencies
- Vulnerabilities are addressed promptly
- Dependencies are reviewed before inclusion

## Disclosure Policy

We follow responsible disclosure practices:

1. Acknowledge receipt of vulnerability reports within 48 hours
2. Provide regular updates on the remediation progress
3. Coordinate public disclosure with the reporter
4. Credit reporters in security advisories (if desired)
5. Aim to fix critical vulnerabilities within 7 days

## Security Advisories

Security advisories will be published on GitHub Security Advisories for any vulnerabilities that affect supported versions.

## Contact

For security-related questions or concerns:
- Email: security@veil.dev
- GitHub Security: https://github.com/ushiradineth/veil/security