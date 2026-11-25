# Auth0 setup

One Auth0 API protects the web app and the MCP endpoint. Do this once per environment (dev and production each get their own API and application, or share one tenant).

## How it fits together

- The web app signs in with the Auth0 SPA SDK and sends `Authorization: Bearer <access token>` on every `/api` call.
- MCP clients (Claude connectors) find Auth0 through `/.well-known/oauth-protected-resource/mcp`, register themselves with Dynamic Client Registration, and send the same kind of token to `/mcp`.
- The server checks signature, issuer and audience, then maps the token's `sub` to a profile in `users.auth_sub`.
- The API identifier (audience) must be the canonical MCP URL, for example `https://gym-mcp-v2-production.up.railway.app/mcp`. MCP clients send that URL as the OAuth `resource`, and Auth0 turns it into the token audience.

## Auth0 dashboard

1. **API**: Applications > APIs > Create API. Identifier = the MCP URL above, signing algorithm RS256. On the API's Settings tab turn on **Allow Offline Access** (refresh tokens keep the phone signed in).
2. **Single page application**: Applications > Create Application > Single Page Web Applications. Set Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins to the app origin (`https://<host>`, plus `http://localhost:5173` for local work). Copy the Client ID.
3. **Database connection**: Authentication > Database > Username-Password-Authentication. Turn on **Disable Sign Ups** so only users you create can sign in, then add users under User Management. Enable the connection for the SPA application.
4. **Tenant settings** (Settings > Advanced):
   - turn on **Resource Parameter Compatibility Profile**
   - turn on **Dynamic Client Registration (DCR)** and keep **Enable Application Connections** checked
5. **Domain-level connection**: apps created by DCR only see connections promoted to domain level. Promote the database connection with the Management API: `PATCH /api/v2/connections/{id}` with `{"is_domain_connection": true}` (token needs the `update:connections` scope).

## Railway variables

Server (runtime):

| Variable | Example |
|---|---|
| `AUTH0_DOMAIN` | `your-tenant.eu.auth0.com` |
| `AUTH0_AUDIENCE` | `https://<host>/mcp` |
| `AUTH_CLAIM_MAP` | `you@example.com=Silvano` links that email to the existing profile named Silvano on first sign-in. Several entries separated by commas. The value is a profile name or id. |
| `AUTH_ALLOWED_EMAILS` | Extra emails allowed to sign in, comma separated. Emails in `AUTH_CLAIM_MAP` are allowed automatically. |

Frontend (read at build time, so redeploy after changing them):

| Variable | Example |
|---|---|
| `VITE_AUTH0_DOMAIN` | same as `AUTH0_DOMAIN` |
| `VITE_AUTH0_CLIENT_ID` | Client ID of the SPA application |
| `VITE_AUTH0_AUDIENCE` | same as `AUTH0_AUDIENCE` |

Remove `MCP_SECRET`; it is no longer used.

An email that is neither in `AUTH_ALLOWED_EMAILS` nor in `AUTH_CLAIM_MAP` gets a 403, even if Auth0 would let it sign in.

## Letting others sign up

To share the app, set `AUTH_ALLOW_ANY_USER=true` and turn **Disable Sign Ups** off on the Auth0 database connection. Anyone with the link can then create an account; the email must be verified before the app lets them in. Each login gets its own empty profile and can delete it again from the profile menu (the Auth0 user itself stays and is removed in the Auth0 dashboard).

Set `SECRETS_KEY` to a long random string (`openssl rand -hex 32`) so that people can connect their own Garmin account: each profile stores its personal Garmin API key encrypted with it. Keep the value; if it changes, stored keys become unreadable and have to be entered again. Without `SECRETS_KEY` the Garmin section stays hidden. An older server-wide `GARMIN_API_KEY` is moved into the first profile at the next start (the log says so); after that the variable can be deleted.

MCP clients register themselves as third-party applications (client ids start with `tpc_`). The API's "User Access: Allow" covers only your own applications, so also set the default permissions for third-party applications on the API, otherwise Auth0 answers "Client is not authorized to access resource server".

## First sign-in

Sign in once through the web app with an email from `AUTH_CLAIM_MAP`. That links the login to the existing profile, so old plans, sessions and Garmin data stay with it. Do this before connecting MCP: a login without a linked profile and a verified email is refused.

Then add the connector in Claude with the URL `https://<host>/mcp` (no token in the URL) and sign in when the window opens.

## Local development

Leave the Auth0 variables unset and run the server with `AUTH_DISABLED=true`. Every request then acts as the default user. This switch is ignored when `NODE_ENV=production`.
