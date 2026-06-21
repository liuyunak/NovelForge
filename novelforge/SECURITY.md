# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.5.x   | ✅ Active support  |
| < 3.5   | ❌ End of life     |

## Reporting a Vulnerability

If you discover a security vulnerability in NovelForge, please report it responsibly.

- **Do NOT open a public GitHub issue** for security vulnerabilities.
- Email: create a GitHub Security Advisory via the **Security** tab on the repository, or contact the maintainers directly.
- We aim to respond within **48 hours** and provide a fix timeline.

## Security Best Practices for Users

1. **JWT Secret**: Always use a randomly generated JWT secret. The Setup Wizard auto-generates one on first run.
2. **API Keys**: Store API keys via the Web Setup Wizard. Never commit `.env` to version control.
3. **Network**: Run NovelForge behind a reverse proxy (Nginx/Caddy) with HTTPS in production.
4. **Rate Limiting**: Login and registration endpoints have built-in rate limiting.
5. **Updates**: Keep your NovelForge installation updated to the latest version.

## Known Security Considerations

- API keys are stored in `data/ai-providers.json` — ensure this file is not world-readable.
- User data is stored as JSON files in `data/` — consider migrating to PostgreSQL for production deployments.
- The `/api/setup` endpoints are public by design (setup mode). After setup completes, JWT auth is enforced on all other endpoints.
