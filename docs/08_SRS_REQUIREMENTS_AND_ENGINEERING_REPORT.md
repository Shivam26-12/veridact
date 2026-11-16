# VERIDACT Software Engineering Project Report

## Abstract

VERIDACT is a web-based cyber-incident intake and case-management prototype. It allows a reporter to submit an incident, optionally attach evidence, and track the case by its case number. Staff authenticate with role-scoped accounts, review and assign cases, record investigation notes and response actions, and maintain a custody timeline. A Gemini-backed background service provides advisory severity prediction and a report-detail/verifiability score. Images can be stored as authenticated Cloudinary assets; local disk remains the fallback and is used for other evidence types.

This report describes the implemented system as it exists in the repository. It distinguishes delivered features from incomplete or planned features, especially evidence-specific AI analysis, which is not implemented. Performance figures below are proposed acceptance targets unless identified as test results; they are not claims of measured production performance.

## 1. Software Requirements Specification

### 1.1 Purpose and Scope

The purpose of VERIDACT is to provide a single workflow for receiving cyber-incident complaints, preserving associated evidence metadata, assigning investigations, recording staff activity, and providing administrators with an AI-assisted queue signal.

The current project scope includes:

- Public complaint submission, including anonymous submission.
- Optional evidence upload with server-side type/size checks and SHA-256 integrity hashing.
- Case-number-based public status tracking with a restricted response payload.
- Account registration for citizens, login, JWT authentication, and role-based access.
- Case listing, search and filters, assignment, staff notes, severity updates, and response-action logging.
- Investigator submission of completed work for super-admin review; approval resolves the case, while return requires a reason.
- Generation of a detailed investigation PDF on super-admin approval, based on the recorded complaint, investigator notes, evidence hashes, AI triage advisory, and custody timeline.
- Reporter ownership verification using either the authenticated citizen account or a one-time access code for anonymous reports; the code is hashed in storage.
- Separate internal and reporter-safe investigation PDFs; reporter copies exclude internal notes, private log details, and IP addresses.
- Reporter acceptance of a resolved outcome (closing the case), a reasoned request for more justification/transparency (reopening the case), or withdrawal of an active complaint.
- Append-only-by-API custody event recording and staff audit views.
- Gemini-powered advisory severity prediction, report-detail score, summary, and derived review priority.
- Optional authenticated Cloudinary storage for images, with local storage as fallback; other supported evidence uses local storage.

The following are outside the verified implemented scope and must not be represented as operational requirements of the current release:

- Deepfake or authenticity analysis of uploaded evidence files. The existing `/api/incidents` route group is for response actions and timelines, not evidence classification.
- API-partner authentication/integration, SMS/email notification, mobile clients, department partitioning, or production hosting infrastructure.
- Production-grade database migration management. Startup contains targeted compatibility migrations for triage scoring and reporter access-code hashes; general schema migration tooling is not configured.

### 1.2 Intended Users

| User | System role | Primary need | Access boundary |
|---|---|---|---|
| Citizen or reporter | `citizen`, or anonymous visitor | Submit a report, attach evidence, receive a case number, check public status | Public submission and sanitized case tracking; authenticated citizens see only their own submitted cases |
| Investigator | `investigator` | Work assigned incidents, inspect evidence, add notes and response actions, submit work for review | Cases assigned to the investigator |
| Supervisor | `supervisor` | Review the organization-wide queue, assign cases, adjust operational severity, inspect triage, analytics, and custody | Broad case access; no user administration or resolution decision endpoint |
| Super administrator | `super_admin` | Manage users, assign cases, review AI triage, retry triage, approve/return resolutions, inspect system custody and analytics | Organization-wide access and administrative operations |
| External AI provider | Gemini API, system dependency rather than human actor | Produce structured advisory triage output from complaint text | Receives the submitted incident title, type, description, and evidence-presence flag; it is not authoritative and does not determine truthfulness |
| Image storage provider | Cloudinary, optional system dependency | Store authenticated image assets and issue signed download URLs | Used only for image evidence when configured; API credentials remain server-side |

### 1.3 Functional Requirements

Priority meanings: `Must` is required for the implemented case-management workflow; `Should` is valuable but incomplete or needing hardening; `Future` is explicitly outside the verified current implementation. Status refers to the codebase, not an external deployment.

| ID | Requirement | Priority | Status / verification |
|---|---|---|---|
| FR-01 | The system shall allow a visitor to submit an incident without authentication and assign a unique incident number. | Must | Implemented by `POST /api/cases/anonymous`; exercised in backend tests. |
| FR-02 | The system shall allow a registered user to log in and receive a bearer JWT; inactive accounts shall be denied. | Must | Implemented by `/api/auth/login`; password hashes use bcrypt through Passlib. |
| FR-03 | Self-registration shall create a citizen account only; it shall not allow self-assignment of staff roles. | Must | Implemented by `/api/auth/register` and `register_user`. |
| FR-04 | The submission workflow shall validate required incident title, description, and type, and accept optional contact, location, and affected-system fields. | Must | Pydantic request validation; request limits and choices are declared in `case_schemas.py`. |
| FR-05 | The reporter shall be able to attach an allowed evidence file to an existing case in a separate multipart request. | Must | Implemented by `/api/cases/{case_id}/evidence`; attachment can fail independently of case creation. |
| FR-06 | The system shall reject unsupported evidence extensions/types and files over the configured size limit, and compute a SHA-256 digest for accepted files. | Must | Implemented in file validation and evidence service; current default maximum is 100 MB. |
| FR-07 | The system shall store image evidence as authenticated Cloudinary assets when configured, and otherwise store files locally. Non-image evidence shall use local storage. | Must | Implemented; upload storage backend is selected server-side using `CLOUDINARY_URL`. |
| FR-08 | The system shall return the case number after case creation even if the second evidence-upload request fails, and allow retrying the file for the same case. | Must | Frontend recovery handling has been added; the retry must not create another case. |
| FR-09 | Public tracking shall return status and public notes without exposing contact details, assignment data, or internal notes. | Must | Implemented by `GET /api/public/cases/{case_number}`. |
| FR-10 | The system shall return cases according to user role: investigators see assigned cases, citizens see their own authenticated submissions, and supervisors/admins see the broad queue. | Must | Implemented in `case_service.list_cases`; anonymous cases are visible to staff roles. |
| FR-11 | Staff shall be able to search/filter cases, inspect details and evidence metadata, and record notes with an explicit public/internal flag. | Must | Implemented across case APIs and case-detail UI. |
| FR-12 | Staff shall be able to record response actions, with a timestamped custody event. | Must | Implemented through `/api/incidents/{case_id}/response`; investigator access is assignment-scoped. |
| FR-13 | Supervisors and super admins shall be able to assign cases and update the operational severity. | Must | Implemented through `PATCH /api/cases/{case_id}` with role checks. |
| FR-14 | Investigators shall be able to submit completed work for admin review but shall not directly resolve or close a case. | Must | Implemented: investigator changes status to `under_review`; backend forbids investigator resolution/closure. |
| FR-15 | A super admin shall approve a case awaiting review to set `resolved`, or return it to `in_progress` with a required non-empty reason saved as an internal note and audit event. | Must | Implemented by `POST /api/cases/{case_id}/review`; covered by tests. |
| FR-16 | The system shall append custody events for important case/evidence operations and provide authorized timeline and admin views. | Must | Implemented through custody service and routes. API has no general update/delete route for custody records. |
| FR-17 | On case creation, the system shall schedule Gemini triage when configured; the result shall contain predicted severity, report-detail score, summary, model name, status, and priority. | Must | Implemented as a FastAPI background task stored in `case_triage`; Gemini failure records `unavailable` without blocking the case. |
| FR-18 | The triage score shall describe report detail/verifiability and shall not be represented as the probability of truthfulness. | Must | Enforced in prompt and reflected in admin UI/help text. This is a product-safety requirement. |
| FR-19 | Triage priority shall be `urgent` for predicted high/critical severity; otherwise score below 25 shall be `low`, with remaining scores `standard`. | Must | Implemented in `_review_priority`; admin queue sorts urgent, standard, low, then remaining untriaged cases, newest first within priority. |
| FR-20 | A super admin shall be able to retry unavailable or refresh completed triage; users without the super-admin role shall be denied. | Must | Implemented by `POST /api/cases/{case_id}/triage`; permission test included. |
| FR-21 | The admin interface shall display the predicted severity, score, summary, and priority and allow the human administrator to apply predicted severity explicitly. | Must | Implemented in the case list and detail UI; AI prediction does not silently overwrite operational severity. |
| FR-22 | Staff shall be able to preview/download authorized local evidence and private Cloudinary images. | Must | Implemented using an authenticated local file route and expiring Cloudinary signed links. Investigator access is assignment-checked. |
| FR-23 | Super admins shall be able to manage users by changing roles, organization, or active status, and view analytics/custody administration pages. | Must | User updates and analytics are implemented. Verify each UI operation against route-level role checks. |
| FR-24 | On super-admin approval, the system shall generate a full internal report and a reporter-safe investigation PDF from the case narrative, appropriate notes, evidence metadata/hashes, triage advisory, and custody timeline. | Must | Implemented by `report_service`; reporter output excludes internal notes, raw private log details, staff identity, and IP addresses; covered by tests. |
| FR-25 | The system shall verify reporter ownership before releasing the investigation PDF or accepting a public decision. | Must | Authenticated citizen ownership or one-time anonymous access code; anonymous code is stored hashed. |
| FR-26 | A reporter shall be able to accept a resolved case, request additional justification/transparency with a required explanation, or withdraw an active case. | Must | Implemented through public decision endpoint; actions are logged; request-changes reopens to `in_progress`. |
| FR-27 | The system shall analyze uploaded files for evidence-level deepfake authenticity and persist a verdict/heatmap. | Future | Not implemented in current backend routes/models; Gemini complaint triage is not evidence analysis. |
| FR-28 | The system shall provide API-partner credentials and tenant-isolated integration. | Future | Role token exists in constants, but partner authentication/workflows do not exist. |

### 1.4 Non-Functional Requirements

| ID | Quality attribute | Requirement and proposed acceptance measure | Current evidence / limitation |
|---|---|---|---|
| NFR-01 | Security | All staff endpoints shall require valid JWT authentication; role and assignment checks shall be enforced server-side. Unauthorized and cross-case requests shall return 401/403. | JWT/RBAC dependencies and backend tests exist. Anonymous intake and evidence-upload endpoints are intentionally public; abuse controls need deployment review. |
| NFR-02 | Password protection | Passwords shall be stored only as salted bcrypt hashes and never returned by API responses. | Passlib/bcrypt and user-response schemas; admin tests verify hashes are omitted. |
| NFR-03 | Data confidentiality | Public tracking shall not expose contact information, private staff notes, assignee data, or private evidence URLs. | Public endpoint returns a restricted object; signed links are staff-only. |
| NFR-04 | Upload integrity | Accepted evidence shall be size/type checked server-side, hashed with SHA-256, and associated with an upload custody event. | Implemented. `python-magic` may be unavailable on some systems, causing extension-based fallback; deployment should install and verify it. |
| NFR-05 | Secret management | Gemini and Cloudinary credentials shall be loaded from backend environment configuration, never bundled into frontend assets or source control. | `.env` loading and ignore rules exist; rotate credentials if exposed and provision them per environment. |
| NFR-06 | AI safety and explainability | AI outputs shall be advisory, bounded, and accompanied by a neutral summary; low detail shall not be labelled proof of fraud. Human roles retain severity, assignment, and resolution authority. | Prompt/schema and UI wording implement the intent; AI output quality still requires ongoing evaluation. |
| NFR-07 | Reliability | Gemini or Cloudinary provider failure shall not corrupt an already-created case; Gemini failure shall leave the case available for manual review. | Gemini failures are caught and stored as `unavailable`. Evidence upload is a second request; the frontend preserves case ID/number and supports file-only retry. |
| NFR-08 | Maintainability | Business logic shall reside in service modules, request/response contracts in Pydantic schemas, and UI/API concerns in separate React services/pages. | Existing project structure follows these boundaries. Automated migration coverage remains narrow; schema changes require tests. |
| NFR-09 | Usability | A reporter shall receive a durable case number and a clear distinction between case creation and optional evidence upload failure. Staff shall see role-appropriate queue and review controls. | Submission recovery, case list, and role-specific controls exist. Full accessibility audit has not been demonstrated. |
| NFR-10 | Performance | Target: ordinary case-list requests should complete within 2 seconds at 100 concurrent cases on the target localhost machine; file upload should complete within 30 seconds for a 10 MB file on a typical broadband connection, excluding provider latency. | These are proposed targets, not measured SLAs. Gemini latency is external and currently subject to timeout/provider availability. |
| NFR-11 | Availability | When Gemini is unavailable, case intake, assignment, investigation, and review shall continue without AI results. | Implemented fallback state. Cloudinary failure for an image currently fails that upload rather than silently switching providers. |
| NFR-12 | Portability | The development system shall run on supported Windows/macOS/Linux Python and Node environments with environment-configurable database, upload directory, and service credentials. | SQLite, dotenv settings, Vite, Python requirements; `python-magic` has OS-level dependency considerations. |
| NFR-13 | Auditability | Significant state changes shall record actor, case, action, time and notes; evidence access/upload shall be traceable. | Custody log service covers core events; verify completeness as workflows expand. |
| NFR-14 | Data recovery | Production deployment shall back up the SQLite database and evidence store together and periodically test restore. | No automated backup/restore facility is implemented; operational procedure is required before production. |

### 1.5 Constraints

- The backend is Python/FastAPI/SQLAlchemy; the frontend is React 18, TypeScript, Vite, and React Router.
- The default database is a local SQLite file. SQLite is appropriate for development/demo use but is not a substitute for a reviewed production database plan under concurrent multi-user load.
- The app depends on external Gemini and optionally Cloudinary services for their respective functions; network availability, provider quotas, key validity, and provider terms affect those paths.
- Gemini is called synchronously inside a background task using a configured request timeout. The case response is not blocked by completion, but durable queue/retry infrastructure is not present.
- Evidence upload is a separate HTTP request after case creation. Partial success is possible and must be represented to the reporter.
- The configured maximum upload size is 100 MB; accepted types are determined by extension and detected/fallback MIME rules.
- JWTs are stored in browser local storage. This is a prototype tradeoff and requires a threat-model review before production.
- The current `create_all()` startup process plus targeted triage-score and reporter-token-column migrations is not a complete versioned migration system.
- Anonymous reporter decision access uses a one-time high-entropy code; only its SHA-256 hash is stored. Existing cases cannot use reporter decisions unless an ownership credential exists or the authenticated citizen is the submitter.
- Case numbers are currently generated from the current case count plus one; simultaneous submissions can race and require a database-backed sequence or collision-safe retry before higher-concurrency deployment.
- Anonymous reporter decision and report access require the one-time high-entropy access code shown on the submission receipt; only its hash is stored. The reporter must retain the code, and public case number alone is not authorization.
- Only English interface content and the four human roles described above are in scope; `api_partner` is not implemented.
- Evidence-level authenticity analysis is not available in the current implementation. Investigation PDFs summarize recorded workflow data and are not forensic findings or guarantees of legal admissibility.

### 1.6 Assumptions

- Staff accounts are provisioned by a super admin or seeded for local demonstration; public registration creates citizen accounts only.
- Staff roles and assignment data in the database are maintained by authorized administrators.
- Reporters have a network connection to the application during submission; a case number is issued after case creation commits.
- Report text sent to Gemini is suitable for processing by the configured provider under the organization’s privacy rules. If this cannot be assumed, disable Gemini triage or obtain appropriate consent and provider review.
- A Cloudinary connection string is optional and available only in the backend environment; local storage remains configured and writable for fallback/non-image files.
- A score estimates report detail and verifiability from available text, not factual authenticity, identity, criminality, or reporter intent.

### 1.7 Scope Boundaries

| In scope now | Out of scope or incomplete |
|---|---|
| Complaint intake, tracking, staff case management | Evidence-level deepfake classifier and heatmaps |
| Evidence metadata, hashing, local/optional Cloudinary image storage | Production forensic certification or legal admissibility guarantee |
| AI-assisted complaint severity/report-detail triage | AI decision automation or reporter credibility determination |
| Assignment, notes, response actions, review/return workflow | Implemented forensic PDF generation/retrieval |
| Role-based admin, investigator, supervisor, and citizen paths | API partner integration, notifications, mobile app, and multi-tenant isolation |

## 2. Requirement Analysis

### 2.1 Stakeholder Analysis

| Stakeholder | Interest / need | Influence | Requirement implication |
|---|---|---:|---|
| Citizen/reporting person | Submit a complaint with or without evidence, obtain a receipt number, safely track progress | Medium | Public intake, accessible validation, durable case number, privacy-limited tracking |
| Investigator | See assigned work, inspect evidence, record actions/notes, request review | High | Assignment-scoped access, evidence preview, custody timeline, review submission |
| Supervisor | Balance workload, assign cases, monitor priorities and outcomes | High | Broad queue, operational severity controls, analytics, case notes |
| Super administrator | Manage users and system workflow, make final review decision, inspect global audit data | High | User administration, retry AI triage, review decisions, global case/custody visibility |
| SOC/organization leadership | Understand volume and service performance | Medium | Aggregate analytics; future reports need validated definitions and export controls |
| System operator/developer | Configure, run, diagnose, back up, and update the local application | High | Environment configuration, logs, tests, migration procedure, operational documentation |
| Gemini provider | Receive incident text for advisory classification | External | Minimize transmitted data, keep credentials server-side, define provider/privacy controls |
| Cloudinary provider | Store private image evidence and serve time-limited URLs | External | Authenticated assets, credential protection, upload/deletion failure handling |

### 2.2 Actors and Use Cases

| Actor | Principal use cases | Preconditions / outcome |
|---|---|---|
| Anonymous reporter | Submit incident; optionally attach a file; retry a failed attachment; track by case number | Case is created before optional file upload; successful result returns case number and evidence hash where applicable |
| Registered citizen | Register, log in, inspect own authenticated case list; public tracking remains available | Registration is constrained to citizen role |
| Investigator | View assigned cases; inspect evidence; add internal/public note; log response; submit case for review | Valid JWT and case assignment required for investigator-specific case access |
| Supervisor | View organization queue; assign/reassign investigator; adjust operational severity; inspect analytics, triage, notes, custody | Valid supervisor role |
| Super administrator | All supervisor queue actions plus user management, retry triage, and approve/return resolution | Valid super-admin role; return action requires a reason |
| Gemini API | Produce structured triage response | Backend key configured and provider responds before timeout; otherwise case is marked unavailable for manual review |
| Cloudinary | Accept authenticated image and provide signed retrieval URL | Cloudinary configuration present and upload succeeds; otherwise image upload fails and can be retried |

### 2.3 Key User-System Interactions

**A. Public complaint intake**

1. Reporter selects an incident type and enters title, description, and optional contact/location/system details.
2. The browser sends `POST /api/cases/anonymous`.
3. The backend validates the request, creates the case and custody event, and returns a case ID/number.
4. If Gemini is configured, triage is scheduled independently. Intake does not wait for AI completion.
5. If a file was selected, the client sends a separate multipart request to `POST /api/cases/{case_id}/evidence`.
6. The evidence service validates the upload, computes SHA-256, stores the file locally or in Cloudinary for configured images, creates metadata, and appends an audit event.
7. On file upload failure, the case remains valid; the client preserves its case number and retries only the attachment.

**B. Admin triage and assignment**

1. Admin requests the case queue; server filters by role and orders admin/supervisor cases by urgency, standard, low, then untriaged priority, with recent cases first within each group.
2. Admin sees predicted severity, report-detail score, summary, and priority as advisory data.
3. Admin may apply the predicted severity explicitly or choose an operational severity independently.
4. Admin assigns the case to an investigator. The assignment controls that investigator’s list and detail access.
5. If triage is unavailable, only a super admin can request a retry; otherwise staff continue manual review.

**C. Investigation and resolution review**

1. Investigator opens an assigned case, views evidence and custody history, writes notes, and logs response actions.
2. Investigator moves the case to `under_review` when work is ready; investigators cannot mark it `resolved` or `closed`.
3. Super admin reviews the submitted work. Approval sets `resolved`; return requires a non-empty reason, writes an internal note/audit event, and returns status to `in_progress`.
4. A super admin may close the case after resolution.

**D. Public tracking**

1. Reporter supplies the case number.
2. The public endpoint returns status, a display label, timestamps, incident type, and public notes only.
3. Contact details, assigned investigator, internal notes, and private evidence URLs are excluded.

**E. Reporter reviews the completed investigation**

1. On admin approval, the system generates an investigation PDF from notes, evidence metadata and hashes, AI advisory fields, and custody events.
2. The reporter verifies ownership with the authenticated citizen account or the private one-time code issued for an anonymous submission.
3. The reporter downloads and reviews the report, then accepts the result (case closes), requests additional justification/transparency with a required explanation (case returns to `in_progress`), or withdraws an active complaint.
4. The system records reporter decisions in the custody timeline. A case number alone is not sufficient authorization.

### 2.4 System Requirements and Traceability

| Requirement group | IDs | Main implementation / test evidence |
|---|---|---|
| Public intake and validation | FR-01 to FR-08 | `routes/cases.py`, `routes/evidence.py`, `SubmitPage.tsx`, `test_cases.py`, `test_evidence.py` |
| Identity, roles, access | FR-02, FR-03, FR-10, FR-23 | `routes/auth.py`, `utils/security.py`, frontend route guards, `test_auth.py`, `test_cases.py`, `test_admin.py` |
| Case work and review | FR-11 to FR-16 | `services/case_service.py`, `routes/cases.py`, response route, `test_cases.py`, `test_response_workflow.py`, `test_custody.py` |
| AI triage | FR-17 to FR-21 | `services/triage_service.py`, `models/case_triage.py`, `CaseListPage.tsx`, `CaseDetailPage.tsx`, `test_triage.py` |
| Investigation report and reporter decisions | FR-24 to FR-26 | `services/report_service.py`, `routes/public.py`, `routes/reports.py`, `test_reporter_decisions.py` |
| Evidence analysis/integration boundary | FR-27 to FR-28 | No implemented evidence-analysis endpoint/model or partner auth; future scope |

## 3. Software Architecture and Design

### 3.1 Architectural Style

VERIDACT uses a browser-based single-page application and a modular monolithic REST backend. The frontend is a React SPA served by Vite during development. Axios sends JSON and multipart requests through the `/api` development proxy to FastAPI. FastAPI separates route handling, Pydantic schemas, service/business logic, SQLAlchemy models, and utilities. The database is a local SQLite file by default.

This architecture is appropriate for a college prototype because it keeps deployment and debugging simple, makes API contracts visible through FastAPI/OpenAPI, and separates concerns without adding distributed infrastructure. It is not a claim that the current SQLite/local-process design is production-scalable.

### 3.2 Major Modules and Responsibilities

| Layer/module | Responsibility | Main interactions |
|---|---|---|
| Frontend pages and router | Public intake/tracking; login/register; dashboards; case, evidence, and admin screens | Calls frontend API services; role guards control route rendering |
| Frontend hooks and state | Authentication state, case-list loading/pagination, toast and form state | Consumes API-service responses; stores JWT/user in browser local storage |
| Frontend API services | Typed Axios wrapper for auth, cases, evidence, reports, analytics/admin | Adds bearer token; maps UI actions to REST endpoints |
| FastAPI application | CORS, router registration, startup table creation, targeted triage schema migration, health check | Dispatches HTTP requests to route modules |
| Route modules | HTTP validation/dependencies, role requirements, response serialization | Invoke service modules and database dependency |
| Service modules | Case lifecycle, auth, evidence storage, custody, admin analytics, Gemini triage | SQLAlchemy persistence; external Gemini/Cloudinary calls where configured |
| Pydantic schemas | Validate request shape and serialize API response contracts | Used by FastAPI routes and OpenAPI generation |
| SQLAlchemy models | Relational entities: users, cases, evidence, notes, reports, custody, triage | Persisted in SQLite; relationships define case ownership/association |
| Local file storage | Non-image evidence, image fallback, generated-file directory | Evidence path stored in database; exposed through authorized route |
| Cloudinary | Optional private image storage and time-limited signed access | Called from evidence service using backend credentials |
| Gemini API | Complaint-level severity and report-detail scoring | Called from background triage task; response saved to `case_triage` |

### 3.3 Request and Data Flows

- **Case creation:** frontend `SubmitPage` -> `caseService.createCaseAnonymous` -> `POST /api/cases/anonymous` -> `case_service.create_case` -> `cases` and `custody_logs`; response returns case number.
- **AI triage:** route schedules a FastAPI background task -> `triage_service` saves pending state -> Gemini structured response -> `case_triage` result. Errors become `unavailable`, not a failed case.
- **Evidence upload:** frontend evidence service -> multipart evidence route -> validation and SHA-256 -> Cloudinary for configured images or local disk -> evidence record and custody event.
- **Case list:** role-filtered case service -> priority ordering for supervisors/admins -> enriched response with triage fields -> admin/investigator UI.
- **Review:** investigator updates case to `under_review` -> super-admin review route -> service approves or returns with required reason -> case state, internal note if returned, and custody event.

### 3.4 Data Design

The main entities are `User`, `Case`, `Evidence`, `CaseNote`, `CustodyLog`, `Report`, and `CaseTriage`. A case can have zero or one triage record and many evidence, notes, custody events, and reports. Users can submit cases, be assigned cases, upload evidence, author notes, perform custody actions, and generate reports.

`Case.severity` is the operational staff-controlled value. `CaseTriage.predicted_severity` is an AI suggestion. `report_detail_score` describes detail/verifiability and is explicitly not a factuality probability. `review_priority` is derived from the model output with high/critical prediction taking precedence over a low score.

### 3.5 Design Decisions and Rationale

- **Modular monolith:** one FastAPI process and service boundary reduces local setup complexity and suits the current scope; independent service deployment is deferred.
- **Role checks on the backend:** UI route guards improve navigation but do not replace server-side authorization. Case assignment is checked for investigator reads/updates.
- **Separate triage table:** AI result lifecycle is independent from case state; separate storage avoids overwriting staff-controlled severity and supports legacy schema evolution.
- **Background triage:** report creation is not blocked on Gemini latency. Provider failures fall back to manual review.
- **Two-step case/evidence intake:** lets the case receive a durable number before a large file transfer; requires explicit partial-success recovery to avoid duplicate cases.
- **Private evidence delivery:** Cloudinary images use authenticated assets and expiring links; local files are served through an access-checked endpoint rather than public filesystem paths.
- **SQLite by default:** removes local DB-server setup for a demo, but requires migration, backup, concurrency, and operational review before production.
- **Count-based case numbering:** is simple for a single-user demonstration, but is not a concurrency-safe identifier strategy; replace it with a transactional sequence/unique retry before multi-user deployment.

### 3.6 Architectural Limitations

- Investigation PDF generation is implemented from stored workflow records; it summarizes the recorded case and is not a forensic finding or legal-admissibility guarantee.
- No evidence-level AI analysis route or analysis-result entity is implemented; Gemini triage analyzes complaint text, not file authenticity.
- No durable queue (Celery/RQ/broker) exists; FastAPI background tasks are process-bound and are not guaranteed across a process crash.
- General database versioning/migrations are absent; startup migration support is narrowly targeted.
- Anonymous intake and upload need production abuse controls, rate limits, privacy policy, and operational monitoring review.

## 4. Software Quality Assurance

### 4.1 Quality Strategy

Quality is assessed through layered testing: unit tests for services and calculations, API tests for status codes/validation/RBAC/persistence, frontend TypeScript and production build checks, and manual end-to-end workflows for submission, evidence, triage, assignment, review, and tracking. External providers are mocked in deterministic tests; one separate smoke test may call real services with synthetic data and must clean temporary assets.

### 4.2 Existing Verification Assets

| Area | Existing mechanism | What it verifies | Limitation |
|---|---|---|---|
| Backend | pytest with in-memory SQLite fixtures | Auth, case creation/list/filter/update, role scopes, response workflow, admin endpoints, custody, evidence storage/preview, Gemini triage/priority/migration | Does not establish production load, provider uptime, or legal suitability |
| Frontend | `npm run build` runs `tsc` then Vite production build | Type correctness and production bundle compilation | Does not replace component/browser interaction tests |
| Frontend lint | `npm run lint` | ESLint rules across TS/TSX | Must be run separately; build does not execute lint |
| API contract | FastAPI generated `/docs` and Pydantic schemas | Request/response shape and interactive local API inspection | OpenAPI correctness does not prove security or business-flow correctness |
| Manual E2E | Test submission in isolated database, Gemini smoke test, assign/investigate/return/approve/close | Cross-layer functionality, including provider model configuration | Must use synthetic data; external service results vary with provider and network |

The recorded repository test baseline after triage schema migration was 102 passing backend tests. This is a snapshot, not a permanent guarantee; rerun the suite after changes.

### 4.3 Test Strategy and Cases

1. **Unit tests:** score clamping and priority boundaries (0, 24, 25, 100), severity precedence, Gemini JSON/schema error handling, SHA-256 determinism, role checks, and migration idempotency/data preservation.
2. **API integration tests:** valid/invalid anonymous submission, authenticated registration/login, unsupported file and oversized file rejection, case list filters, assignee visibility, public-data redaction, evidence access denial, admin-only retry, and required resolution-return reason.
3. **Workflow tests:** case creation followed by successful evidence upload; attachment failure then retry against the same case ID; Gemini unavailable with manual continuation; investigator submit -> admin return -> investigator follow-up -> resubmit -> admin approve -> close.
4. **Frontend tests (recommended):** submit-page double-click protection, partial-success display, retry-only-file action, API error display, role-specific case list, low-score red indicator, and admin review controls.
5. **Security tests:** invalid/expired JWT; inactive user; investigator cross-assignment reads and writes; citizen access to private notes/evidence; path traversal attempt against local file endpoint; anonymous upload size/type enforcement; no API secrets in frontend bundles/logs.
6. **Performance/reliability tests (recommended before release):** paginated list at representative case volume; 10 MB upload timing; DB backup/restore; external provider timeout and retry behavior.

### 4.4 Quality Attributes and Controls

- **Reliability:** case creation commits before evidence transfer; Gemini failures become an unavailable state; file retry uses the same case. Remaining risk: process-bound background tasks can be lost on abrupt server shutdown.
- **Security:** bcrypt password hashing; signed JWT bearer authentication; route-level role restrictions; investigator assignment checks; sanitized public tracking; private image links; environment-based provider keys; file type/size/path checks.
- **Maintainability:** separation into route/schema/service/model layers; typed TypeScript API models; explicit tests around workflow boundaries. Main gap: no comprehensive migration framework and report stubs are easy to mistake for completed features.
- **Usability:** multi-step intake, case-number receipt, case search/filters, readable validation, role-specific queues, score explanation, and file-only recovery after partial submission. Accessibility conformance has not been formally audited.
- **Performance:** pagination and bounded Gemini request timeout exist. No load-test data or production SLO is available; Gemini response time is external. Proposed local targets should be measured, not assumed.
- **Auditability:** state changes and evidence actions append custody logs with actor/time/action/notes; ensure new mutating endpoints add equivalent events.

### 4.5 Acceptance Measures for a Release Candidate

| Measure | Acceptance condition |
|---|---|
| Regression | Full backend test suite passes; frontend typecheck/build passes; lint passes or all warnings are dispositioned |
| Public intake | Valid case produces exactly one case number; attachment retry does not create another case |
| Authorization | Investigator cannot access another investigator's case/evidence; citizen cannot retrieve internal notes or private evidence URL |
| AI fallback | Gemini timeout/invalid JSON produces `unavailable`; assignment and human review remain usable |
| AI priority | High/critical predicted severity is urgent even when report-detail score is low; other scores below 25 are low priority |
| Persistence | Restart preserves case, triage, evidence metadata, and custody records; schema migration is repeatable and non-destructive |
| Recovery | Backup restore recovers database and matching evidence storage references |

## 5. Project Planning and Management

### 5.1 Planning Basis

The following is a realistic six-week academic team plan for completing and validating the prototype. It is a proposed plan, not a claim of historical work. Replace role labels with actual student names before submission. Assume a four-person team, weekly review, issue tracking, and one shared source-control repository.

### 5.2 Responsibility Allocation

| Role allocation | Primary responsibilities | Review/coordination duties |
|---|---|---|
| Student A: Project lead / analyst | Stakeholder interviews, requirements baseline, acceptance criteria, risk register, meeting notes | Resolve scope conflicts; approve milestone exit criteria |
| Student B: Backend / data engineer | FastAPI routes/services, SQLAlchemy models, validation, migration strategy, test fixtures | API contract review; database backup and security review |
| Student C: Frontend / UX engineer | React pages, route guards, forms, case and admin dashboards, error/loading states | Usability walkthroughs; accessible interactions and responsive layout |
| Student D: QA / integration engineer | Test plan, automated API tests, synthetic E2E workflow, regression reporting, deployment/setup docs | Cross-layer integration, defect triage, release checklist |
| All team members | Code review, documentation, demo preparation, privacy review | No production data or secrets in commits; approve release candidate |

For a smaller team, combine Student A with D and B with C only after estimating workload; preserve independent review for security-sensitive changes.

### 5.3 Milestones and Deliverables

| Week | Milestone | Main tasks | Deliverables / exit criteria |
|---|---|---|---|
| 1 | Requirements and scope baseline | Confirm roles, user journeys, privacy boundary, implemented-vs-future scope, risks | Approved SRS, stakeholder/use-case list, initial backlog, acceptance criteria |
| 2 | Architecture and data foundation | Finalize API contracts, schema, role checks, local environment, migration approach | Architecture diagram, schema, reproducible backend/frontend setup, seed/test strategy |
| 3 | Intake and evidence vertical slice | Public form, case creation, upload validation/hash, storage adapter, receipt and retry behavior | E2E case + file upload; duplicate-safe attachment retry; upload tests |
| 4 | Staff workflow and triage | Case queue/detail, assignment, notes, custody, Gemini scoring, priority ordering, failure fallback | Investigator/admin workflow; deterministic mocked AI tests; triage score explanation |
| 5 | Hardening and integration | Review/return lifecycle, privacy/RBAC tests, migration checks, provider smoke tests with synthetic data | Regression suite, threat checklist, defect triage, candidate documentation |
| 6 | Acceptance and presentation | Usability pass, backup/restore rehearsal, demo dataset, final report and presentation | Release candidate, test report, final SRS/architecture/maintenance docs, demo script |

### 5.4 Project Controls

- Track each requirement by ID from this report through implementation issues and tests.
- Use short iterations with a demonstrable vertical slice rather than implementing UI and backend in isolation.
- Gate merges on test pass, review from another team member, schema compatibility check, and secret scan/manual environment-file check.
- Maintain a risk register for AI-provider availability, privacy of complaint text, upload partial failures, database migration, and evidence retention.
- Keep demo/test content synthetic and use a disposable database. Do not reset the working user database as part of routine acceptance testing.
- Treat Gemini and Cloudinary credentials as secrets; rotate any key exposed in chat, screenshots, issue trackers, or commits.

### 5.5 Major Deliverables

1. Approved SRS and stakeholder/use-case analysis.
2. Architecture, data model, and API contract documentation.
3. Public intake, case management, evidence, role management, and triage features within the declared scope.
4. Backend test report and frontend build/lint results.
5. Security/privacy checklist, environment setup instructions, and known-limitations register.
6. Test database/demo script, final project report, and presentation materials.

## 6. Software Maintenance

### 6.1 Testing After Changes

- Run backend tests from `backend/` with the project virtual environment: `python -m pytest -q`.
- Run frontend checks from `frontend/`: `npm run build` and `npm run lint`.
- For changes to case schemas/models, test both a fresh database and an upgrade from a copy of the previous schema. Never use a destructive reset on a database containing wanted records.
- For triage changes, mock Gemini in the regular test suite; use a separate synthetic-data smoke test for provider integration, response schema, timeout, and key validity.
- For evidence changes, test local storage and Cloudinary branches, file validation, SHA-256, authorization, path traversal, upload failure, cleanup, and retry against the same case ID.
- Run the full role workflow after changes to assignment, case state, notes, or review decisions.
- Test reporter ownership with both an authenticated citizen and an anonymous access code; verify invalid codes are rejected and raw codes are never persisted or returned by tracking responses.
- Inspect reporter-safe PDFs for leakage of internal notes, IP addresses, staff-only log details, and contact information whenever report content changes.

### 6.2 Updates and Dependency Management

- Pin or constrain dependency upgrades, review release notes/security advisories, update lockfiles only in the owning project, then run unit, integration, and build checks.
- Keep frontend dependencies in `frontend/package.json` and Python dependencies in backend requirements files; do not run npm for the Python backend.
- Maintain separate development/test and production environment settings. Never commit `.env` files; use a secret manager in hosted environments.
- Update the documented Gemini model deliberately and validate that the configured key can invoke it. Provider model names and availability can change; model-list success alone does not establish generation availability.
- For Cloudinary, verify authenticated uploads, signed URL expiry, deletion semantics, quotas, and retention policy after SDK upgrades.

### 6.3 Modification and Extension Procedures

- **Add a case field:** update SQLAlchemy model, Pydantic request/response schema, migration, service behavior, frontend type/form/view, tests, and SRS traceability.
- **Add an incident type or allowed file type:** update constants, schema literals, upload validator, UI options/accept list, tests, documentation, and any analytics aggregation.
- **Change AI scoring:** version the prompt/schema/model configuration; keep the score interpretation explicit; test threshold boundaries and severity override; store model name and evaluation time; never silently overwrite human severity.
- **Add an evidence-analysis feature:** define a separate evidence-analysis entity/API/result contract. Do not conflate complaint-level Gemini triage with evidence authenticity classification.
- **Extend investigation reports:** preserve separate staff and reporter-safe audiences; update report generation, authorization, custody logging, and privacy tests together.
- **Change roles or permissions:** update server dependencies/services first, then frontend route guards/navigation; add positive and negative authorization tests.

### 6.4 Debugging and Operations

1. Confirm which frontend and backend processes are running and their ports; frontend development proxy targets `127.0.0.1:8000` by default.
2. Check `/api/health`, then inspect the relevant request in browser developer tools, including method, URL, status, and response body. A successful health check does not prove every route or database query is healthy.
3. Review backend logs for the complete exception. Do not expose credentials or complaint data in shared logs.
4. Confirm the backend process uses the intended `.env`, Python environment, and database URL. A different working directory/environment variable can select a different SQLite file.
5. For database errors, inspect the active file and table columns, back it up, run a tested idempotent migration, and re-query the failing endpoint.
6. For Gemini problems, distinguish authentication, unsupported model, quota/provider errors, timeout, and invalid structured response. Verify with synthetic text only and preserve the manual-review path.
7. For evidence problems, determine whether case creation succeeded before upload. Retry evidence using the original case ID; do not resubmit the whole form.

### 6.5 Backup, Recovery, and Data Retention

The repository does not implement automated backup/restore or retention enforcement. Before deployment, define ownership and policy for the SQLite database, local evidence directory, Cloudinary assets, backups, audit records, contact details, and AI-provider data. Back up the database and referenced evidence together; test restoration into an isolated environment; verify evidence IDs, hashes, and file availability after restore. A production deployment should use a reviewed retention schedule and documented deletion/incident-response procedures.

### 6.6 Maintenance Risks and Future Work

| Risk / gap | Maintenance action |
|---|---|
| Startup schema evolution is only partially automated | Adopt versioned migrations such as Alembic before adding more schema changes |
| Background tasks are process-bound | Introduce a durable queue only if workload/reliability requirements justify the additional infrastructure |
| Investigation reports contain sensitive case data | Keep separate staff and reporter-safe reports and regression-test content redaction |
| No evidence-level AI analysis | Treat as a separately scoped feature with representative data, evaluation, and human oversight |
| External AI/storage providers may fail or change API/model behavior | Maintain timeouts, fallback states, provider smoke tests, key rotation, and operational alerting |
| Public endpoints may be abused | Add reviewed rate limiting, request-size controls, monitoring, and abuse-response procedures before public production exposure |
| Browser token storage and development defaults need production review | Threat-model token handling, secure transport, secrets, CORS, and deployment configuration |
| SQLite/local-file consistency and concurrency | Reassess storage/database architecture before multi-instance or high-concurrency deployment |
| Count-based incident number generation | Use a database sequence/atomic counter or handle unique-key collisions with bounded retry |

## References to Project Documents

- [Product Requirements Document](01_PRODUCT_REQUIREMENTS_DOCUMENT.md)
- [Technical Requirements Document](02_TECHNICAL_REQUIREMENTS_DOCUMENT.md)
- [App Flow and Navigation](03_APP_FLOW_AND_NAVIGATION.md)
- [Backend Schema and Database Design](05_BACKEND_SCHEMA_AND_DATABASE_DESIGN.md)
- [Software Modelling and UML Diagrams](07_SOFTWARE_MODELLING.md)
- [Project README and setup](../README.md)
