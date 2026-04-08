# FundSphere Project Roadmap

## Goal
Build a stable end-to-end platform where:
- researchers complete onboarding,
- profile and discovery pages show real data,
- `CoreBackend` and `ai-service` communicate reliably,
- and the project is deployment-ready.

## Phase 1 - Stabilize Current Features (P0)

### Deliverables
- Correct grant upsert status behavior:
  - `201 Created` when a new grant is inserted
  - `200 OK` when an existing grant is updated or unchanged
- Researcher profile page in frontend shows onboarding-collected fields.
- Dashboard top label updated to `FundSphere` everywhere.
- Onboarding payload contract is aligned between frontend and backend DTOs.

### Tasks
1. Finalize `GrantController` response status mapping using `SaveOrUpdateResult.created`.
2. Validate `saveOrUpdateGrant` behavior for:
   - new `grantUrl`
   - same `grantUrl` + same checksum
   - same `grantUrl` + changed checksum
3. Complete researcher profile UI in `frontend/src/components/profile/` using onboarding values.
4. Verify dashboard header text in all layouts/components.

## Phase 1.5 - Authentication & User Data (P0.5)

### Deliverables
- Secure researcher profiles so users only access their own data.
- Protect backend APIs from unauthorized access.

### Tasks
1. Implement user authentication (e.g., JWT) in `CoreBackend`.
2. Update `frontend` to handle login/logout, route guards, and token storage.
3. Bind the Onboarding data and Researcher Profile to a specific `userId`.

## Phase 2 - Service Communication (P1)

### Deliverables
- Working integration between `CoreBackend` and `ai-service`.
- Stable contract for recommendation and search requests.

### Tasks
1. Define request/response schemas for AI calls.
2. Add/confirm bridge endpoints in `CoreBackend` for AI operations.
3. Expose and validate required routes in `ai-service/rag/routes.py`.
4. Add timeouts, retries, and clear error mapping between services.

## Phase 3 - Live Discovery Integration (P1)

### Deliverables
- Discovery page uses real API data (no hardcoded mocks).
- Reliable UX for loading, empty, and error states.

### Tasks
1. Connect `frontend/src/components/discovery/` to backend/AI endpoints.
2. Replace mock grant lists with API-driven ranked results.
3. Add user-friendly states:
   - loading skeleton/spinner
   - no results message
   - retry on failure
4. Surface freshness fields like `updatedAt` / `lastScrapedAt` where useful.

## Phase 4 - Quality and Testing (P2)

### Deliverables
- Baseline automated test coverage across all layers.
- Safer changes with contract checks.

### Tasks
1. Backend tests (`CoreBackend`):
   - create/update/no-change upsert status assertions
   - checksum behavior
   - onboarding payload validation
2. Frontend tests (`frontend`):
   - onboarding -> profile render flow
   - discovery component rendering with API responses
3. AI service tests (`ai-service`):
   - route happy-path
   - fallback/error behavior
4. Add one end-to-end smoke path for core user journey.

## Phase 5 - Production Readiness (P2/P3)

### Deliverables
- Environment-based configs and safer deployment workflow.
- Basic observability for troubleshooting.

### Tasks
1. Move secrets and env-specific values to environment variables.
2. Add structured logging and request correlation IDs between services.
3. Create deployment checklist:
   - health checks
   - migration steps
   - rollback plan
4. Finalize run/deploy docs in `docs/`.
5. Automate the web scraper in `ai-service` (e.g., set up a cron job or Celery worker to run it daily).

## Suggested Execution Order (Simple)
1. P0 stabilization first
2. P1 service communication
3. P1 discovery live integration
4. P2 testing
5. P2/P3 production hardening

## Definition of Done for v1
- Onboarding data is saved and shown in profile.
- Discovery shows real recommendations.
- Grant upsert returns correct HTTP status (`201` create, `200` update/no-change).
- Core flows are covered by baseline tests.
- Local and deployment docs are complete enough for team handoff.
