# MicroCAD Vision — Issue → Codex → Draft Pull Request

The workflow `.github/workflows/codex-from-issue.yml` is opt-in and is not active until its Draft PR is merged into the default branch.

## One-time owner setup

1. Review this automation Draft PR. Merge only if you want this workflow enabled.
2. Configure an OpenAI API project with a conservative usage budget. API billing is separate from ChatGPT Plus / Codex subscription.
3. In repository Settings → Secrets and variables → Actions, add a repository secret named `OPENAI_API_KEY`. Paste your secret **there only**, never in an Issue or ChatGPT message.
4. In repository Settings → Actions → General, enable 'Allow GitHub Actions to create and approve pull requests'. The automation only creates a **draft PR** and never auto-merges.
5. In Issues → Labels, create `codex:run` (one time). Applying this label to a trusted open Issue starts one Codex run.

## Day-to-day workflow without copy/paste

1. Tell ChatGPT what to change. ChatGPT creates a complete private GitHub Issue and specifies a base branch, if needed, using an HTML comment such as `<!-- codex-base: feat/image-navigation-multiselect -->`.
2. ChatGPT labels the Issue `codex:run` to authorize dispatch. This triggers Codex GitHub Action automatically; no prompt needs to be pasted into Codex Web.
3. Codex reads the Issue, edits the checked-out base branch in a sandbox, and produces a patch. A separate job applies the patch and proposes a **draft PR**.
4. Review changes, tests, calibration/geometry and Windows/YOLO model compatibility before merging. Update the local copy with GitHub Desktop.

## Important safety and limitations

- This uses **Codex GitHub Action through OpenAI API**, not Codex Cloud task quota from the ChatGPT app. Both OpenAI API usage and GitHub Actions minutes may be billed.
- Only deliberately labeled Issues trigger API usage; not every Issue. Do not label untrusted Issue content.
- API credentials remain in a GitHub Secret; the Codex job is read-only on GitHub, while a separate job with write permission creates the Draft PR.
- The workflow rejects changes to `.github/`, `AGENTS.md`, `.env`, certificate and key files; maintainers must still review all proposed changes.
- An optional `codex-base` marker can select an existing `main`, `feat/...`, `fix/...` or `release/...` branch. Default is repository default branch.
- Cloud CI cannot prove native Windows behavior, USB camera access, actual `best.pt` inference or NVIDIA GPU. Test on Windows before release.
- If a run fails, check GitHub Actions logs. Common blockers: no API secret, insufficient API billing, GitHub Actions PR permission, missing branch or test dependencies.

Official Codex Action reference: https://developers.openai.com/codex/github-action
