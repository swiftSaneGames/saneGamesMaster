# Connect GitHub to the studio dashboard

The hosted dashboard can read repository metadata directly from GitHub. In **Settings → GitHub synchronization**, an owner can verify the connection and refresh the repository list. **New game / Edit game** can then select an accessible private game repository. A linked game's workspace shows the last synchronized branch, visibility and push time.

This connection is separate from the GitHub plugin in a chat and from Git credentials on a Mac worker. A chat connection does not supply a credential to Cloudflare. The source must be deployed and the runtime secret configured before synchronization works.

## Connect once

1. In GitHub, create a **fine-grained personal access token** under an authorized studio account. Select **swiftSaneGames** as the resource owner, set an expiration, and choose **Only select repositories**. Include the existing private game repositories that the dashboard should discover. Access to the master framework repository is not a substitute for access to the games.
2. Use only **Metadata: Read-only** repository permission. This connector reads repository metadata; it does not need Contents, Actions, Issues, Pull requests, Administration or any write permission. If organization policy requires approval, wait for approval. A pending token may only expose public resources.
3. In Cloudflare, open **Workers & Pages → sanegamesmasterdashboard → Settings → Variables and Secrets**. Add **GITHUB_TOKEN** as a **Secret**, enter the value there, and deploy the secret change. Do not add it to `wrangler.jsonc`, an ordinary visible variable, Git, a game brief, a screenshot or chat.
4. Deploy the current `main` revision using the existing [hosted deployment configuration](HOSTED_DASHBOARD.md). Keep the existing Worker, SQLite Durable Object and Google access policy.
5. Sign in to the dashboard, open **Settings**, and click **Sync repositories**. A successful authenticated response records the metadata and sync time. Check that the expected private repositories appear, then create or edit a game and choose its repository.

An already authorized local Cloudflare administrator can set the secret through Wrangler instead of the web console. From the repository root, this command prompts securely for its value:

```bash
npx --yes wrangler@4.147.0 secret put GITHUB_TOKEN
```

Do not put the value in the command line. Deployment permissions and the GitHub token must be configured in the authorized account environment; neither is included in this repository.

## What synchronization means

| Feature | Behavior |
|---|---|
| Scope | The fixed `swiftSaneGames` organization, limited to repositories GitHub exposes to the configured token. Public repositories can also appear in the metadata list. |
| Game selection | Only accessible private repositories that are not archived or disabled are offered as game choices. The `saneGamesMaster` framework repository is excluded. An existing URL remains editable when synchronization is unavailable. |
| Metadata | Repository name and URL, visibility, archived/disabled state, default branch, last push and last metadata update. |
| Refresh | Explicit owner action. Merely viewing the dashboard does not repeatedly call GitHub. There is no webhook or background GitHub polling service. |
| Freshness | A successful snapshot is current for 15 minutes. Older data is marked stale and can be refreshed. This is not a continuous connectivity test. |
| Failures | A failed refresh cannot claim a successful connection. A previous snapshot for the same credential can remain visible as historical data with an error. |
| Credential changes | Removing or replacing the runtime secret requires fresh verification. The old credential's cached repository list is not presented as the new connection. |
| Persistence | The bounded snapshot and safe synchronization status persist in the studio's existing SQLite storage. The token is never stored in that snapshot or returned to the browser. |
| Bounds | At most 500 repositories. Exceeding the supported bound fails explicitly without replacing a previous complete snapshot with a partial list. Refresh attempts are rate limited and time bounded. |

A successful request with no private repositories does not prove private game access. Check the selected resource owner, repository selection, token expiration, approval and the account's own access. Adding a new private game later may require adding that repository to the token's selection and syncing again. Repository permission and visibility can change after a snapshot; workers still verify the assigned repository independently before using it.

## What this connection does not change

The connector only sends read requests to GitHub. It does not clone or upload code, create repositories, merge branches, edit issues, trigger Actions, or grant worker access. The [game bootstrap](GAME_BOOTSTRAP.md), [worker setup](WORKER_SETUP.md) and reviewed integration writer handle their separate responsibilities. Synchronization does not start Claude, change game stages, alter a release decision, or publish a game.

Repository pushes are not a percentage of game completion. Follow actual assignment updates in the [Claude/dashboard workflow](CLAUDE_DASHBOARD_WORKFLOW.md). GitHub branch and push metadata provide source context alongside those updates.

## Troubleshooting

- **Setup required:** Configure `GITHUB_TOKEN` as a Cloudflare runtime secret and deploy the source and secret changes.
- **Not verified:** Run **Sync repositories**. Configuration alone is not a successful GitHub connection.
- **Access rejected:** Check token expiration, resource owner, selected repositories, organization approval and account access. The UI deliberately does not display raw provider responses or credentials.
- **Connected but no game choices:** Confirm private game repositories exist and are selected. Public, archived and disabled repositories and `saneGamesMaster` are not game choices.
- **Stale or failed refresh:** The displayed data is historical. Retry once the network, provider or access problem is resolved; do not treat the old timestamp as current.
- **Refresh already running / too many attempts:** Let the bounded request finish before retrying. Repeated clicking does not create more permission or improve connectivity.
- **Repository moved, renamed or archived:** Synchronize, verify its current identity, and explicitly edit the game's URL if necessary. Existing game links are not silently rewritten and running assignments keep their original context.

For rotation, replace the Cloudflare secret and verify the new connection before revoking a superseded token if continuity is needed. To disconnect, remove the secret and revoke the token in GitHub. Repository metadata already recorded in private studio storage or exports remains historical information; disconnection is not a data-erasure operation.

## Official references

- [GitHub organization repository endpoint and Metadata read permission](https://docs.github.com/en/rest/repos/repos#list-organization-repositories)
- [Fine-grained personal access tokens, resource owners and approval](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

Local and CI fixtures can verify implementation behavior. They do not prove that the production Worker has this secret or can access your private repositories. Confirm the live sync time and expected repository list after deployment.
