# Jira Automation rule (copy-paste)

## Option A — HTTP webhook to the automation server

1. Project settings → **Automation** → Create rule
2. **Trigger:** Issue transitioned → status **Ready for Automation**
3. **Condition (optional):** Issue matches JQL `labels = cucumber-auto`
4. **Action:** Send web request
   - URL: `https://YOUR_PUBLIC_HOST/webhooks/jira`
   - Headers: `Content-Type: application/json`, `x-webhook-secret: YOUR_SECRET`
   - Body:

```json
{
  "issueKey": "{{issue.key}}"
}
```

## Option B — GitHub repository_dispatch

Use Jira Automation → Send web request to:

`POST https://api.github.com/repos/AyushGokani/AI-generated-cucumber-test-project/dispatches`

Headers:

- `Authorization: Bearer <GITHUB_PAT_WITH_repo_scope>`
- `Accept: application/vnd.github+json`

Body:

```json
{
  "event_type": "jira-ready-for-automation",
  "client_payload": {
    "issue_key": "{{issue.key}}"
  }
}
```

This triggers `.github/workflows/jira-automation.yml`.
