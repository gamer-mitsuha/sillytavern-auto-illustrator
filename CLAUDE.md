# **Claude Development Workflow & Instructions**

This document outlines the core principles and workflow for all development tasks. As an AI assistant, your role is to be a collaborative partner. Adherence to these guidelines is mandatory for every change.

## **0\. Branch Management (CRITICAL)**

**IMPORTANT:** The `main` branch is production code used for distributing extension updates. All development must happen on feature branches.

1. **Create a Feature Branch:** Before making ANY changes, create a new branch from `main`:
   - Branch naming: `feat/feature-name`, `fix/bug-name`, `docs/description`, etc.
   - Example: `git checkout -b feat/add-min-generation-interval`

2. **Work on Feature Branch:** Make all your changes, commits, and tests on this branch.

3. **Verify Before Merging:** Only merge to `main` after:
   - All tests pass
   - All quality checks pass (formatter, linter)
   - Build success
   - The feature has been confirmed working
   - User has approved the merge

4. **Merge to Main:** Once approved:
   - Switch to main: `git checkout main`
   - Merge feature branch: `git merge feat/feature-name`
   - Push to origin: `git push origin main`
   - Delete feature branch: `git branch -d feat/feature-name`

**Never commit directly to main. Always use feature branches.**

## **1\. Understand, Plan, and Get Approval**

Before writing any code, you must follow this sequence:

1. **Review Product Requirements:** Consult [`docs/PRD.md`](docs/PRD.md) to understand the desired behaviors for the feature you're working on. The PRD is the single source of truth for feature behaviors and should guide your implementation.
2. **Analyze Existing Code:** Thoroughly review the current codebase to understand its structure, patterns, and conventions. Ask which files are relevant if you are unsure.
3. **Formulate a Plan:** Create a clear, step-by-step plan detailing the changes. Use the instruction "think hard" to give yourself more time to consider the best approach. Outline the files you will create or modify.
4. **Verify Against PRD:** Ensure your plan will maintain all behaviors documented in the PRD. If your changes affect documented behaviors, note this in your plan.
5. **Wait for Approval:** Present the plan for review. **Do not proceed until the plan is approved.**

## **2\. Code Style and Quality**

- **Clarity and Simplicity:** Write clear, simple, and idiomatic code. Add comments to explain complex logic.
- **No Dead Code:** Do not leave commented-out blocks of old code in the codebase.
- **Security First:** Do not include hardcoded secrets (API keys, passwords). Always validate and sanitize user input where appropriate.
- **Consistent Style** Follow Google Coding Style Guide, e.g., Google TypeScript Style Guide.
- **Adding Settings:** When adding new settings, follow the comprehensive guide in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#adding-new-settings). This is critical to avoid common pitfalls like missing event listeners that cause settings to not persist.
- **Internationalization (i18n):** This extension supports both English and Chinese. When adding ANY user-facing text (UI labels, toast messages, error messages, button text, etc.), you MUST:
  1. Add the English text to [`i18n/en-us.json`](i18n/en-us.json)
  2. Add the Chinese translation to [`i18n/zh-cn.json`](i18n/zh-cn.json)
  3. Use the `t()` function to reference the text in code (e.g., `t('settings.newSetting')`, `t('toast.successMessage')`)
  4. **Never hardcode user-facing strings directly in the code**

## **3\. Unit Tests are Mandatory**

- **Comprehensive Coverage:** Ensure your tests cover the key functionality and relevant edge cases.
- **Verify PRD Behaviors:** When writing tests, reference [`docs/PRD.md`](docs/PRD.md) to ensure your tests validate the documented desired behaviors.
- **Existing Tests:** All existing tests must continue to pass. Do not modify tests unless the underlying feature requirements have changed in the PRD.
- **Write Tests:** Unit tests are required for all new features and bug fixes. Tests can be written before, during, or after implementation based on what works best for the specific task.

## **4\. Pre-Commit Quality Checks**

Before committing, you **must** perform the following checks and ensure they all pass without any errors:

1. **Run Formatter:** Format the code according to the project's standards (e.g., prettier, black, gofmt).
2. **Run Linter:** Check for and fix all linting errors.
3. **Run All Unit Tests:** Execute the entire test suite to confirm that your changes have not introduced any regressions.
4. **Run `npm run build`**: Important because the dist/ dir is necessary for users to update the extension.

**Do not proceed to the next step if any of these checks fail.**

## **5\. Commit Messages**

All commit messages must follow the Conventional Commits specification. The format is:  
\<type\>\[optional scope\]: \<description\>

- **Types:** feat (new feature), fix (bug fix), docs (documentation), style (formatting), refactor, test, chore (build/tool changes).
- **Example:** feat(api): add user authentication endpoint
- **DO NOT include "Co-Authored-By: Claude <noreply@anthropic.com>" in commit messages**.

## **6\. Maintain the Changelog**

- **Append, Don't Overwrite:** You must maintain the CHANGELOG.md file.
- **Add a New Entry:** For every user-facing change (feat, fix), add a new entry to the top of the changelog under the "Unreleased" section.
- **Concise and Clear:** The entry should be a brief, clear description of the change.

## **7\. Product Requirements Document (PRD)**

- **Source of Truth:** [`docs/PRD.md`](docs/PRD.md) is the definitive reference for desired feature behaviors.
- **Prevent Regressions:** Always consult the PRD before making changes to ensure you maintain documented behaviors.
- **Update When Needed:** If you intentionally change a behavior, update the PRD accordingly with approval.
- **Examples Over Implementation:** The PRD focuses on WHAT the system should do (observable behaviors), not HOW it's implemented (methods, classes, events).

By following these instructions, you will ensure all contributions are high-quality, well-tested, and properly documented.
