<!--
This file guides AI coding agents (Copilot-like) when working in this repository.
It is intentionally concise and focused on discovery and actionable steps.
Update this file with concrete examples when the repository contains source code.
-->

# Copilot / AI agent instructions — repo discovery and safe edits

> Note: This repository uses a root-level `.copilot-instructions` as the authoritative system instruction for model selection and architecture mandates. When present, prefer rules in that file for implementation and model choice; use this document primarily for discovery of build/test workflows and safe-editing conventions.

Summary
- The repository currently has no discoverable source files or agent docs. Follow the discovery checklist below to detect the project's language, build and test commands, and integration points. When you find concrete files (package.json, pyproject.toml, Dockerfile, .github/workflows, etc.), update this file with examples and explicit commands.

Essential steps for first run
1. Grep for common manifests and CI files: package.json, pyproject.toml, requirements.txt, setup.py, Pipfile, Gemfile, pom.xml, build.gradle, Cargo.toml, Dockerfile, .github/workflows/*.yml.
2. If a manifest exists, extract build / test / start scripts (e.g. `scripts` in package.json, `tool.poetry.scripts`, Makefile targets).
3. Look for a `README.md` or `docs/` folder. Use it as the source of truth for workflow commands.
4. Check for environment files or secrets placeholders: .env, .env.example, secrets in workflows (use only discoverable keys like DATABASE_URL to infer integrations).

How to detect architecture (quick heuristics)
- Node.js / frontend: presence of package.json, tsconfig.json, src/ with .ts/.tsx or .js/.jsx files, webpack/vite configs.
- Python: pyproject.toml, requirements.txt, setup.py, src/ or package dir with __init__.py, tests/ using pytest.
- .NET: *.csproj files, Program.cs, Dockerfile often targets dotnet runtime images.
- Java: pom.xml or build.gradle, src/main/java and src/test/java.
- Containerized / infra-first: Dockerfile, docker-compose.yml, .github/workflows referencing build-and-push.

Useful conditional commands (run only when the indicated file exists)
PowerShell examples (adjust to the detected environment):

```powershell
# If Node: inspect scripts
if (Test-Path package.json) { cat package.json | ConvertFrom-Json | Select-Object -ExpandProperty scripts }

# If Python: list dependencies
if (Test-Path pyproject.toml) { Get-Content pyproject.toml | Select-String -Pattern "\[tool.poetry\." -Context 0,3 }
if (Test-Path requirements.txt) { Get-Content requirements.txt | Select-String -Pattern '.' }

# If Dockerfile: show entrypoint lines
if (Test-Path Dockerfile) { Select-String -Path Dockerfile -Pattern "ENTRYPOINT|CMD" }
```

Repository-specific patterns to look for
- Source layout: is there a top-level `src/` or a language-specific root (e.g. `app/`, `pkg/`)? Agents should prefer edits under existing source roots.
- Tests: prefer creating/updating tests that follow the repo test runner (pytest, jest, mocha, xunit). Look for test config files (pytest.ini, jest.config.js).
- CI: mirror patterns used in `.github/workflows/*.yml` for build/test steps and environment matrix.

Safe-editing rules for AI agents
- Don't add large new frameworks or change project layout without a PR and an explanation in the PR body.
- When adding scripts or dependencies, update the manifest file (package.json, pyproject.toml) and add a short README snippet documenting the new command.
- Avoid touching Dockerfile/CI unless required for the change; when modifying, run the workflow locally (docker build) if feasible and document the reason.

Editor setup and model defaults
- Workspace-level Copilot defaults live in `.vscode/settings.json`:
	- `github.copilot.advanced.defaultModel`: `gpt-4.1`
	- `github.copilot.advanced.inlineCompletionModel`: `o4-mini`
	- `github.copilot.chat.defaultModel`: `gpt-4.1`
- Do not change these unless instructed by the architect. For the authoritative model policy and roles, see the root-level `.copilot-instructions`.

Reporting and feedback
- If you cannot identify the language or build system after the checks above, open an issue titled "repo: unknown stack — needs minimal README" and include the output of the manifest search.
- After making edits, add or update a one-paragraph note in `README.md` describing the key commands (build/test/run) and the main entry file(s).

Where to improve this file
- Once source files exist, replace the conditional command examples above with concrete scripts extracted from the repository (e.g., `npm run build`, `poetry run pytest`, `dotnet test`).
- Add examples of common refactor patterns in this repo (file names, function naming, shared modules) so the agent can follow established conventions.

Contact
- If you're a human reviewer, please update this file with concrete commands and at least one example workflow after the first commit that adds source code.
