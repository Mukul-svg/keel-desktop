# Contributing to Keel

Thank you for your interest in contributing to Keel! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive experience for everyone.

## Getting Started

### Prerequisites

- Node.js >= 18.x
- Rust >= 1.75
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/yourusername/keel.git
   cd keel
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/originalowner/keel.git
   ```

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the development server:
   ```bash
   npm run tauri dev
   ```

## Making Changes

### Branch Naming

Create a descriptive branch name:

```
feature/add-export-functionality
fix/sync-conflict-resolution
docs/update-readme
refactor/optimize-database-queries
```

### Types of Changes

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools

## Pull Request Process

1. Update your branch with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Ensure your code follows the coding standards

3. Run linting and type checks:
   ```bash
   npm run lint
   npm run typecheck
   ```

4. Run Rust checks:
   ```bash
   cd src-tauri
   cargo clippy
   cargo test
   ```

5. Commit your changes with a descriptive message (see [Commit Messages](#commit-messages))

6. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

7. Open a Pull Request against `main`

### PR Requirements

- [ ] Code follows the project's coding standards
- [ ] All tests pass
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow conventions
- [ ] PR description clearly explains the changes

## Coding Standards

### TypeScript / React

- Use TypeScript for all new code
- Follow the existing code style (Prettier + ESLint)
- Use functional components with hooks
- Keep components small and focused
- Use Zustand for state management

### Rust

- Follow standard Rust conventions
- Use `cargo fmt` for formatting
- Run `cargo clippy` and fix all warnings
- Add documentation comments for public functions
- Handle errors properly using `Result`

### File Organization

```
src/
├── components/          # Reusable UI components
│   └── ComponentName/
│       ├── index.tsx    # Main component
│       ├── styles.css   # Component styles
│       └── types.ts     # Component types
├── stores/              # State management
│   ├── slices/          # Feature-specific slices
│   └── types.ts         # Store types
└── assets/              # Static assets
```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Examples

```
feat(editor): add markdown table support

fix(sync): resolve conflict resolution modal not closing

docs(readme): update installation instructions

refactor(db): optimize note query performance

chore(deps): update tauri to v2.1.2
```

### Rules

- Use the present tense ("add feature" not "added feature")
- Use the imperative mood ("move cursor" not "moves cursor")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Issue Guidelines

### Bug Reports

When filing a bug report, please include:

1. **Description**: Clear and concise description of the bug
2. **Steps to Reproduce**: Numbered steps to reproduce the behavior
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Screenshots**: If applicable
6. **Environment**:
   - OS and version
   - Node.js version
   - Rust version
   - Keel version

### Feature Requests

When requesting a feature:

1. **Description**: Clear description of the feature
2. **Use Case**: Why this feature would be useful
3. **Proposed Solution**: How you think it could be implemented
4. **Alternatives**: Any alternative solutions you've considered

## Questions?

If you have questions about contributing, feel free to:

- Open a discussion on GitHub
- Ask in the issue tracker
- Contact the maintainers

Thank you for contributing to Keel!
