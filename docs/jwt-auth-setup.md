# JWT Auth Setup (CoreBackend + Frontend)

## What is implemented

- CoreBackend JWT authentication with access and refresh tokens.
- Auth endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- Protected APIs use `Authorization: Bearer <accessToken>`.
- Frontend login/register page with session persistence in `localStorage`.
- Automatic token refresh on HTTP 401 responses.
- Researcher onboarding now saves per authenticated user (`/api/researchers` + `/api/researchers/me`).

## Required backend properties

In `CoreBackend/src/main/resources/application.properties`:

```properties
security.jwt.secret=U2FtcGxlQmFzZTY0U2VjcmV0S2V5Rm9yRnVuZFNwaGVyZTEyMzQ1Njc4OTAxMjM=
security.jwt.access-token-expiration-ms=900000
security.jwt.refresh-token-expiration-ms=604800000
app.frontend.origin=http://localhost:5173
```

`security.jwt.secret` can be either:

- a Base64 string (recommended), or
- a plain text secret (minimum 32+ characters).

## Postman quick flow

1. Register:
   - `POST /api/auth/register`
   - body: `{ "fullName": "Test User", "email": "test@example.com", "password": "password123" }`
2. Copy `accessToken` and `refreshToken` from response.
3. Call protected endpoint with header:
   - `Authorization: Bearer <accessToken>`
4. Refresh token:
   - `POST /api/auth/refresh`
   - body: `{ "refreshToken": "<refreshToken>" }`
5. Logout:
   - `POST /api/auth/logout`
   - body: `{ "refreshToken": "<refreshToken>" }`

## Notes

- Internal AI indexing endpoints remain API-key capable.
- User recommendation endpoint is JWT protected via frontend session.
- Existing researcher rows created before JWT/user linking may need manual data cleanup if strict constraints are later enforced.

## ai-service internal key enforcement

- `ai-service` now enforces `X-API-KEY` for non-health endpoints by default.
- Env toggle: `REQUIRE_INTERNAL_API_KEY=true` (default secure mode).
- For local quick-debug only, set `REQUIRE_INTERNAL_API_KEY=false` and restart `ai-service`.

