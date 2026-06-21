# Contributing to NovelForge

Thanks for your interest in contributing! 🎉

NovelForge is an AI-assisted web novel writing workbench. We welcome all contributions — code, docs, bug reports, feature ideas, and more.

## Getting Started

### Prerequisites
- Node.js v20+
- pnpm
- A code editor (VS Code recommended)

### Setup

```bash
git clone https://github.com/your-org/novelforge.git
cd novelforge
pnpm install
pnpm run init
pnpm dev
```

The app will be available at http://localhost:3000.

## Development

### Project Structure

```
novelforge/
├── src/           # Backend (TypeScript + Hono)
│   ├── agents/    # AI Agents (Planner, Writer, Auditor, etc.)
│   ├── core/      # Core pipeline & services
│   ├── api/       # REST API routes
│   └── middleware/ # Auth middleware
├── studio/        # Frontend (React + Vite + TailwindCSS)
│   └── src/
│       ├── components/  # UI components
│       ├── pages/       # Page components
│       └── stores/      # State management (Zustand)
└── tests/         # Test suites
```

### Running Tests

```bash
pnpm test          # Watch mode
pnpm test:run      # Single run
```

### Code Style

We use Biome for linting and formatting:

```bash
pnpm lint          # Check
pnpm lint:fix      # Auto-fix
```

## How to Contribute

### Report Bugs
Open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if helpful

### Suggest Features
Open an issue tagged `enhancement` with:
- Problem you're trying to solve
- Proposed solution
- Alternatives considered

### Submit Code
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `pnpm test:run`
5. Run lint: `pnpm lint`
6. Commit: `git commit -m "feat: add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style (formatting)
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

## Community

- **Questions**: GitHub Discussions
- **Bug Reports**: GitHub Issues
- **Feature Ideas**: GitHub Issues (tag: enhancement)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
