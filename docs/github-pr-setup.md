# GitHub PR automation setup

This opens a **draft PR** with generated Cucumber files for human review.

## 1. Merge the framework first

Your automation code lives on branch `cursor/jira-cucumber-automation-7fa4` (PR #1).

1. Open https://github.com/AyushGokani/AI-generated-cucumber-test-project/pull/1  
2. Click **Ready for review** (if draft), then **Merge pull request**  
3. Confirm merge into `main`

Until `main` has the framework, ticket PRs have nothing solid to land on.

## 2. Create a GitHub token

1. Open https://github.com/settings/tokens?type=beta (fine-grained)  
   or https://github.com/settings/tokens (classic)
2. Generate a token with access to this repo:
   - **Contents:** Read and write  
   - **Pull requests:** Read and write  
   Classic alternative: enable the `repo` scope
3. Copy the token (`github_pat_...` or `ghp_...`)

## 3. Put it in `.env`

```env
GITHUB_TOKEN=paste-token-here
GITHUB_OWNER=AyushGokani
GITHUB_REPO=AI-generated-cucumber-test-project
GITHUB_BASE_BRANCH=main
```

Keep `DRY_RUN=false` (or unset).

## 4. Open a PR for a Jira ticket

```powershell
git pull
npm run pipeline -- --issue KAN-6
```

You should see a PR URL like:
`https://github.com/AyushGokani/AI-generated-cucumber-test-project/pull/N`

## 5. Review like a developer

1. Open the PR on GitHub  
2. Check the `.feature` and `.steps.ts` files  
3. **Mark ready** → **Merge** when happy  

That’s the human-in-the-loop gate.
