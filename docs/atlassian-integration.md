# Jira and Confluence Cloud: scoped-token setup

This integration is read-only. No AI key is needed to test Jira Tickets or
Confluence Hub. Create a separate scoped API token for each product and keep the
tokens in `.env.local` locally, or in server environment variables when deployed.
Authentication is **Basic auth with account email + API token**, not OAuth Bearer.

## 1. Create tokens

Open <https://id.atlassian.com/manage-profile/security/api-tokens>, choose
**Create API token with scopes**, select the product and an expiry date, then
select the following read scopes for the endpoints used by this app:

| Product | Scope | Used for |
| --- | --- | --- |
| Jira | `read:jira-work` | Issue search and details |
| Jira | `read:jira-user` | Current account / Test connection |
| Confluence | `search:confluence` | CQL search |
| Confluence | `read:confluence-user` | Current account / Test connection |
| Confluence | `read:page:confluence` | v2 page and blog-post bodies |
| Confluence | `read:space:confluence` | v2 space key and name |

These are endpoint-documented scope names. “Classic scopes” such as
`read:jira-work` are permissions selectable on a **scoped token**; they do not
mean an unscoped/classic token. A token cannot grant access beyond its account's
product, project, issue or page permissions. If the account's token creation UI
only offers a different scope set, check the endpoint's granular alternatives
before creating the token; do not grant all permissions to get past an error.

## 2. Find the Cloud ID and configure

In your browser, visit:

```text
https://YOUR-SITE.atlassian.net/_edge/tenant_info
```

The JSON response contains `cloudId`. Obtain it for each site being integrated;
Jira and Confluence on different sites may have different IDs.

Copy `.env.example` to `.env.local` only if that file does not exist, then set:

```dotenv
JIRA_BASE_URL=https://YOUR-SITE.atlassian.net
JIRA_DEPLOYMENT=cloud
JIRA_TOKEN_TYPE=scoped
JIRA_CLOUD_ID=YOUR-JIRA-CLOUD-ID
JIRA_EMAIL=YOUR-ACCOUNT-EMAIL
JIRA_API_TOKEN=YOUR-JIRA-SCOPED-TOKEN
JIRA_PROJECT_KEYS=YOUR-PROJECT-KEY

CONFLUENCE_BASE_URL=https://YOUR-SITE.atlassian.net/wiki
CONFLUENCE_DEPLOYMENT=cloud
CONFLUENCE_TOKEN_TYPE=scoped
CONFLUENCE_CLOUD_ID=YOUR-CONFLUENCE-CLOUD-ID
CONFLUENCE_EMAIL=YOUR-ACCOUNT-EMAIL
CONFLUENCE_API_TOKEN=YOUR-CONFLUENCE-SCOPED-TOKEN
CONFLUENCE_SPACE_KEYS=YOUR-SPACE-KEY
```

Leave `JIRA_PAT` and `CONFLUENCE_PAT` empty for scoped tokens. Restart the server
after changing environment variables. `BASE_URL` is always the browser-facing
site URL, never `api.atlassian.com`. The app constructs the API gateway URL.
Settings shows both URLs, with no tokens. Changing credentials, API routing or
other integration settings clears the displayed connection-check result.

For backward compatibility, no token type or Cloud ID means `classic`, using the
site API. Providing a Cloud ID defaults the token type to `scoped`. Explicit
`TOKEN_TYPE=classic` retains the site API. Data Center continues to use
`DEPLOYMENT=datacenter` and `PAT`, without a Cloud ID.

## 3. API formats used by this app

All requests use `Accept: application/json` and an Authorization header of
`Basic base64(email:token)`. The server sets this header; the browser never gets
the token. A JSON POST also uses `Content-Type: application/json`.

### Jira

API base: `https://api.atlassian.com/ex/jira/{cloudId}`

| Operation | Method and path | Scope |
| --- | --- | --- |
| Test identity | `GET /rest/api/3/myself` | `read:jira-user` |
| Search | `POST /rest/api/3/search/jql` | `read:jira-work` |
| Issue details | `GET /rest/api/3/issue/{key}?fields=summary,status,description,project` | `read:jira-work` |

Example search body (the actual app requests additional display fields):

```json
{
  "jql": "project = ABC ORDER BY updated DESC",
  "maxResults": 20,
  "fields": ["summary", "status", "project"]
}
```

Pass the returned `nextPageToken` in the next POST body to paginate.
Original issue links remain `https://YOUR-SITE.atlassian.net/browse/ABC-123`.

### Confluence

API base: `https://api.atlassian.com/ex/confluence/{cloudId}/wiki`

| Operation | Method and path | Scope |
| --- | --- | --- |
| Test identity | `GET /rest/api/user/current` | `read:confluence-user` |
| Search | `GET /rest/api/search?cql={URL-encoded-CQL}&limit=20&start=0` | `search:confluence` |
| Page body | `GET /api/v2/pages/{id}?body-format=storage` | `read:page:confluence` |
| Blog-post body | `GET /api/v2/blogposts/{id}?body-format=storage` | `read:page:confluence` |
| Space metadata | `GET /api/v2/spaces/{spaceId}` | `read:space:confluence` |

Example CQL before URL encoding:

```text
type in (page, blogpost) AND (title ~ "movement" OR text ~ "movement") AND space = "ISAFE"
```

Search passes a cursor on subsequent requests when Confluence returns one.
Cloud body reads use v2 instead of the deprecated v1 get-content endpoint.
Search includes pages and blog posts, so a page-body 404 triggers a blog-post
lookup. v2 returns `spaceId`; a space request recovers the displayed key/name.
v2 does not include the editor display name, so it is omitted; version and
update time are retained. Data Center keeps v1 content reads.

## 4. Acceptance after credentials are available

1. Sign in to OTOG as an admin. Test both services in Settings & integrations.
2. In Jira Tickets, search for a known issue and open its details and original.
3. In Confluence Hub, search for a known page and open its body and original.
4. Check pagination where enough results exist, and a query with no results.
5. Verify project/space boundaries with allowed and disallowed examples.

An identity check is not a complete scope or content-permission test. Unit tests
mock the APIs; no live tenant verification has been performed as part of setup.
No Triage, AS-IS, quiz or release workflow is required for this acceptance.

**Deferred work:** enforce the configured Confluence space allow-list on direct
content reads (search already applies it), review shared-account access, and run
live acceptance with the chosen account. Do not treat the current space search
filter as a complete authorization boundary. These are separate from scoped
token URL/authentication support.

## Official references

- [Scoped tokens and gateway URLs](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/)
- [Cloud ID lookup](https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/)
- [Jira current user](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/)
- [Jira issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Jira issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Confluence search](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/)
- [Confluence users](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-users/)
- [Confluence pages v2](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/)
- [Confluence blog posts v2](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-blog-post/)
- [Confluence spaces v2](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-space/)
