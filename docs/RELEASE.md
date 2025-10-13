# Release Preparation Guide

This document outlines the step-by-step process for preparing and publishing a new release of SillyTavern Auto Illustrator.

## Table of Contents

1. [Pre-Release Checklist](#pre-release-checklist)
2. [Version Numbering](#version-numbering)
3. [Documentation Updates](#documentation-updates)
4. [Quality Checks](#quality-checks)
5. [Git Operations](#git-operations)
6. [GitHub Release](#github-release)
7. [Post-Release](#post-release)

---

## Pre-Release Checklist

Before starting the release process, ensure:

- [ ] All planned features for this release are implemented and merged
- [ ] All tests are passing (`npm test`)
- [ ] Code is properly linted (`npm run lint`)
- [ ] Build succeeds without errors (`npm run build`)
- [ ] Manual testing checklist completed ([docs/MANUAL_TESTING.md](MANUAL_TESTING.md))
- [ ] All critical bugs are fixed
- [ ] Breaking changes are documented (if any)

---

## Version Numbering

Follow [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR** (e.g., 2.0.0): Breaking changes, incompatible API changes
- **MINOR** (e.g., 1.3.0): New features, backward-compatible
- **PATCH** (e.g., 1.2.1): Bug fixes, backward-compatible

**Example Decision Tree:**
- Breaking changes or major architecture refactor? → Bump MAJOR
- New features or significant enhancements? → Bump MINOR
- Only bug fixes or small improvements? → Bump PATCH

---

## Documentation Updates

### 1. Update Version Numbers

Update version in these files:

```bash
# package.json
{
  "version": "1.3.0"
}

# manifest.json
{
  "version": "1.3.0"
}
```

**Note:** These files should already be updated. Verify they match the release version.

### 2. Consolidate CHANGELOG.md

The most important step! Create user-facing release notes.

#### Bad Example (Commit-Level):
```markdown
## [1.3.0]
- feat(gallery): add modal viewer
- fix(gallery): improve FAB button UI
- docs: update CHANGELOG
```

#### Good Example (User-Facing):
```markdown
## [1.3.0] - 2025-10-13

### Added

- **Permanent Gallery Widget**
  - Always-available widget for reviewing all generated images
  - Groups images by message with collapsible headers
  - Minimizes to floating action button (FAB) with image count badge
  - State persists per-chat across sessions

### Fixed

- **Context Caching Issues** (#34)
  - Eliminated stale context/metadata access after chat switches
  - All code now calls `SillyTavern.getContext()` when accessing chat or chatMetadata
```

#### Consolidation Process:

1. **Review commits since last release:**
   ```bash
   git log v1.2.0..HEAD --oneline
   ```

2. **Group commits by user-facing impact:**
   - Features users will see/use
   - Bugs users experienced that are now fixed
   - Performance improvements users will notice
   - Breaking changes users need to know about

3. **Write from user perspective:**
   - Focus on WHAT changed, not HOW it was implemented
   - Use clear, non-technical language where possible
   - Explain the benefit/impact to users
   - Group related changes together

4. **Update date:**
   - Use format: `## [1.3.0] - 2025-10-13`
   - Use today's date (release date)

5. **Clear [Unreleased] section:**
   ```markdown
   ## [Unreleased]

   ## [1.3.0] - 2025-10-13
   ...
   ```

### 3. Update README.md

Add documentation for new features:

- [ ] Update **Features** section with new capabilities
- [ ] Add new sections for major features (e.g., "Gallery Widget")
- [ ] Update **Configuration** section with new settings
- [ ] Add version markers for new features (e.g., "v1.3.0+")
- [ ] Update screenshots if UI changed significantly
- [ ] Review troubleshooting section for new common issues

**Template for new feature section:**
```markdown
### Feature Name (v1.3.0+)

Brief description of what the feature does and why it's useful.

**Features:**
- **Key Feature 1**: Description with user benefit
- **Key Feature 2**: Description with user benefit
- **Key Feature 3**: Description with user benefit

**Usage:**
- Step 1: How to access/enable the feature
- Step 2: How to use basic functionality
- Step 3: Additional tips or advanced usage

**Notes:**
- Important caveats or requirements
- Related settings or dependencies
```

### 4. Update README_CN.md

Mirror all README.md changes in Chinese:

- [ ] Translate new feature sections
- [ ] Translate updated configuration settings
- [ ] Maintain exact parity with English version
- [ ] Verify technical terms are correctly translated

**Common Translations:**
- Widget → 组件
- Gallery → 图库
- Progress → 进度
- Settings → 设置
- Close button → 关闭按钮
- Minimize → 最小化
- Collapse → 折叠

### 5. Archive Obsolete Documentation (Optional)

If you have completed planning documents:

```bash
# Create archive directory
mkdir -p docs/archive

# Move completed planning docs
git mv docs/completed-planning-doc.md docs/archive/

# Create archive README explaining historical context
```

**Archive README Template:**
```markdown
# Archive - Historical Planning Documents

This directory contains completed planning documents kept for historical reference.

## filename.md
**Status**: ✅ Completed in vX.Y.Z (YYYY-MM-DD)
Brief description of what was planned and implemented.
```

### 6. Update docs/PRD.md (If Needed)

Only update if new behaviors need documentation to prevent regressions:

- [ ] Update **Version** and **Last Updated** fields
- [ ] Add new requirement sections if features have specific behaviors
- [ ] Document edge cases or expected behaviors

**Note:** PRD documents behaviors (WHAT), not features (HOW). Only update if you're adding behavioral requirements.

---

## Quality Checks

Run all quality checks and ensure they pass:

```bash
# Run tests
npm test
# Expected: All tests pass (X tests)

# Run linter
npm run lint
# Expected: No errors (warnings are OK if pre-existing)

# Run build
npm run build
# Expected: Successful build, note bundle size

# Format code (if needed)
npm run fix
```

**Document Results:**
- Number of tests passing
- Bundle size (for tracking trends)
- Any pre-existing warnings (should not increase)

---

## Git Operations

### 1. Commit Documentation Updates

```bash
# Check status
git status

# Stage all documentation changes
git add CHANGELOG.md README.md README_CN.md docs/

# Commit with detailed message
git commit -m "docs: prepare v1.3.0 release documentation

- Consolidate XX commits since vX.Y.Z into organized release notes
- Group changes by user-facing features rather than individual commits
- Major features documented:
  - Feature 1
  - Feature 2
  - Feature 3

README updates:
- Add Feature 1 documentation section
- Add Feature 2 documentation section
- Update configuration with new settings

README_CN updates:
- Mirror all English README changes in Chinese
- Add Chinese translations for new features

(Additional changes as applicable)
"
```

### 2. Delete Old Tag (If Re-releasing)

**Only if you're moving an existing tag:**

```bash
# Delete local tag
git tag -d v1.3.0

# Delete remote tag
git push origin :refs/tags/v1.3.0
```

**Note:** Only do this if you need to move a tag. For new releases, skip this step.

### 3. Create Annotated Tag

```bash
git tag -a v1.3.0 -m "Release version 1.3.0

Major Features:
- Feature 1 with brief description
- Feature 2 with brief description
- Feature 3 with brief description

This release includes XX commits with significant improvements,
bug fixes, and new features since vX.Y.Z.

Key Improvements:
- Improvement 1
- Improvement 2
- Improvement 3

For detailed changes, see CHANGELOG.md
"
```

**Tag Message Guidelines:**
- First line: "Release version X.Y.Z"
- Blank line
- Major Features section (3-5 bullet points)
- Blank line
- Summary line (commits, improvements)
- Blank line
- Key Improvements section (3-5 bullet points)
- Blank line
- Reference to CHANGELOG

### 4. Push Tag

```bash
# Push the tag to remote
git push origin v1.3.0

# Verify tag was pushed
git ls-remote --tags origin
```

---

## GitHub Release

### 1. Create Release via GitHub CLI

```bash
gh release create v1.3.0 \
  --title "v1.3.0 - Descriptive Title with Key Features" \
  --notes-file release-notes.md
```

**Alternative:** Create release notes inline:

```bash
gh release create v1.3.0 \
  --title "v1.3.0 - Descriptive Title" \
  --notes "$(cat <<'EOF'
# Release notes content here
EOF
)"
```

### 2. Release Notes Template

Create `release-notes.md` with this structure:

```markdown
# vX.Y.Z - Descriptive Title

Brief summary of what this release brings (1-2 sentences).

## 🎉 Major Features

### Feature 1 Name
- Key capability 1
- Key capability 2
- Key capability 3

### Feature 2 Name
- Key capability 1
- Key capability 2

(Repeat for each major feature)

## 🐛 Critical Fixes

### Issue Category 1
- **Brief description** (if issue #)
- What was fixed
- Impact on users

### Issue Category 2
- What was fixed
- Impact on users

## 🔄 Other Improvements

### Category
- Improvement 1
- Improvement 2

## 📊 Statistics

- **XX commits** since vX.Y.Z
- **XXX tests** passing
- **X KB** bundle size (if changed)
- **XXX lines** (if significant code reduction)

## 📚 Documentation

- What documentation was added/updated
- New guides or sections

## 🙏 Acknowledgments

Thank you to users who reported issues and provided feedback!

---

**Full Changelog**: [vX.Y.Z...vX.Y.Z+1](https://github.com/owner/repo/compare/vX.Y.Z...vX.Y.Z+1)
```

### 3. Verify Release

```bash
# View release in terminal
gh release view v1.3.0

# Or open in browser
gh release view v1.3.0 --web
```

**Check:**
- [ ] Title is clear and descriptive
- [ ] Release notes are well-formatted
- [ ] Tag is correct
- [ ] Not marked as draft or pre-release (unless intentional)
- [ ] All sections are complete

---

## Post-Release

### 1. Announce Release

Consider announcing in:
- [ ] GitHub Discussions (if enabled)
- [ ] Discord/community channels (if applicable)
- [ ] Social media (if applicable)

**Announcement Template:**
```
🎉 SillyTavern Auto Illustrator v1.3.0 is now available!

Key Features:
✨ Feature 1
✨ Feature 2
✨ Feature 3

🐛 Fixes: [Brief mention of critical fixes]

📦 Install: [Installation instructions or link]
📝 Release Notes: [Link to GitHub release]
```

### 2. Monitor for Issues

After release:
- [ ] Monitor GitHub issues for bug reports
- [ ] Check discussions/community channels for feedback
- [ ] Be prepared to release a patch version (vX.Y.Z+1) if critical bugs are found

### 3. Update Project Board (If Applicable)

- [ ] Move completed issues to "Released" column
- [ ] Update milestone status
- [ ] Plan next release features

---

## Quick Reference Checklist

Copy this checklist for each release:

### Pre-Release
- [ ] All tests passing
- [ ] Build succeeds
- [ ] Manual testing complete
- [ ] Version numbers updated (package.json, manifest.json)

### Documentation
- [ ] CHANGELOG.md consolidated (user-facing, grouped, dated)
- [ ] README.md updated (features, configuration)
- [ ] README_CN.md updated (Chinese translations)
- [ ] Obsolete docs archived (if applicable)
- [ ] PRD updated (if needed)

### Quality
- [ ] `npm test` passes (XXX tests)
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds (XXX KB bundle)

### Git
- [ ] Documentation committed with detailed message
- [ ] Old tag deleted (if re-releasing)
- [ ] New annotated tag created
- [ ] Tag pushed to remote

### Release
- [ ] GitHub release created with comprehensive notes
- [ ] Release verified (title, notes, tag, status)
- [ ] Release announced (if applicable)

### Post-Release
- [ ] Monitor for issues
- [ ] Respond to feedback
- [ ] Plan next release

---

## Tips and Best Practices

### Documentation
- **Think like a user**: What do they need to know? What changed for them?
- **Group related changes**: Don't list every commit, consolidate by theme
- **Use clear language**: Avoid jargon, explain technical terms
- **Show benefits**: Not just "added feature X" but "added feature X to solve Y problem"

### Git
- **Annotated tags only**: Use `git tag -a`, not `git tag` (lightweight tags)
- **Descriptive messages**: Tag message should summarize the release
- **Never force push tags**: If you need to move a tag, delete and recreate

### GitHub Release
- **Rich formatting**: Use markdown headers, emojis (sparingly), lists
- **Structure**: Major Features → Fixes → Other Improvements → Stats → Thanks
- **Link to full changelog**: Let users see all commits if they want details

### Common Mistakes to Avoid
- ❌ Listing every commit in CHANGELOG (too granular)
- ❌ Forgetting to update Chinese README (breaks parity)
- ❌ Creating lightweight tags instead of annotated tags
- ❌ Forgetting to run build/tests before release
- ❌ Writing release notes from developer perspective instead of user perspective
- ❌ Leaving [Unreleased] section populated after release

---

## Example: Complete Release Flow

```bash
# 1. Verify everything is ready
npm test && npm run lint && npm run build

# 2. Update documentation
# (Edit CHANGELOG.md, README.md, README_CN.md)

# 3. Commit documentation
git add -A
git commit -m "docs: prepare v1.3.0 release documentation"

# 4. Create and push tag
git tag -a v1.3.0 -m "Release version 1.3.0

Major Features:
- Permanent gallery widget
- Widget visibility controls
- Enhanced mobile UX

For detailed changes, see CHANGELOG.md
"
git push origin v1.3.0

# 5. Create GitHub release
gh release create v1.3.0 \
  --title "v1.3.0 - Gallery Widget and Enhanced UX" \
  --notes-file release-notes.md

# 6. Verify and announce
gh release view v1.3.0
```

---

## Questions or Issues?

If you encounter problems during the release process:

1. Check this guide for the specific step
2. Review recent release commits for reference
3. Check [DEVELOPMENT.md](DEVELOPMENT.md) for development workflow
4. Ask in project discussions or issues

---

**Last Updated**: 2025-10-13
**Document Version**: 1.0
