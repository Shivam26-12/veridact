# VERIDACT Software Modelling

> Implementation-aligned UML views of public incident intake, evidence storage, Gemini-assisted triage, investigator work, and super-admin review.

## Scope and Modelling Notes

The active roles are citizen/reporter, investigator, supervisor, and super admin. Public incident intake can be anonymous. Investigators can read and update only cases assigned to them; supervisors and super admins can access the organization-wide queue. Only super admins can retry AI triage or make the final resolution decision.

Gemini returns an advisory severity prediction, a report-detail/verifiability score from 0 to 100, and a neutral summary. The score is not a probability that a complaint is truthful. Predicted high or critical severity always receives urgent queue priority; otherwise a report-detail score below 25 is low priority. Admins retain control of the case's operational severity and assignment.

Evidence upload is a second request after case creation. A failed attachment must not erase the created case: the frontend retains the case number and retries only the file. Images use authenticated Cloudinary storage when configured; other evidence uses local storage. Private image previews use short-lived signed URLs or the authenticated local-file endpoint.

## Use-Case Diagram

```mermaid
flowchart LR
    Reporter[Citizen / Reporter]
    Investigator[Investigator]
    Supervisor[Supervisor]
    Admin[Super Admin]
    Gemini[Gemini API]

    subgraph Veridact[VERIDACT Incident Management System]
        Register([Register as citizen])
        Login([Authenticate])
        Submit([Submit incident])
        Attach([Attach evidence])
        RetryFile([Retry failed evidence upload])
        Track([Track incident status])
        MyQueue([View assigned cases])
        ReviewQueue([View organization case queue])
        Work([Investigate assigned case])
        Notes([Add internal or public note])
        Response([Log response action])
        SubmitReview([Submit completed case for review])
        Generate([Generate forensic report])
        Custody([Review chain of custody])
        Assign([Assign investigator])
        ManualSeverity([Set operational severity])
        ViewTriage([Review AI triage signal])
        ApplySeverity([Apply predicted severity])
        RetryAI([Retry unavailable AI triage])
        Decide([Approve or return resolution])
        ReturnReason([Record return reason])
        Analytics([View analytics])
        ManageUsers([Manage users])
        Audit([Review system audit logs])
        Analyze([Predict severity and report detail])
    end

    Reporter --> Register
    Reporter --> Login
    Reporter --> Submit
    Reporter --> Attach
    Reporter --> RetryFile
    Reporter --> Track

    Investigator --> Login
    Investigator --> MyQueue
    Investigator --> Work
    Investigator --> Attach
    Investigator --> Notes
    Investigator --> Response
    Investigator --> SubmitReview
    Investigator --> Generate
    Investigator --> Custody

    Supervisor --> Login
    Supervisor --> ReviewQueue
    Supervisor --> Assign
    Supervisor --> ManualSeverity
    Supervisor --> ViewTriage
    Supervisor --> Analytics
    Supervisor --> Work
    Supervisor --> Notes
    Supervisor --> Custody

    Admin --> Login
    Admin --> ReviewQueue
    Admin --> Assign
    Admin --> ManualSeverity
    Admin --> ViewTriage
    Admin --> ApplySeverity
    Admin --> RetryAI
    Admin --> Decide
    Admin --> ReturnReason
    Admin --> Analytics
    Admin --> ManageUsers
    Admin --> Audit
    Admin --> Generate

    Gemini --> Analyze
    Submit -. "creates case, then schedules" .-> Analyze
    Attach -. "optional extension" .-> Submit
    RetryFile -. "if upload failed" .-> Attach
    RetryAI -. "if unavailable" .-> Analyze
    Decide -. "when returned" .-> ReturnReason
```

## Class Diagram

```mermaid
classDiagram
    class User {
        +String id
        +String email
        +String password_hash
        +String role
        +String name
        +String organization
        +Boolean is_active
        +DateTime created_at
        +DateTime updated_at
    }

    class Case {
        +String id
        +String case_number
        +String title
        +Text description
        +String incident_type
        +String status
        +String severity
        +String submitted_by
        +String assigned_to
        +String reporter_access_token_hash
        +String contact_email
        +String contact_phone
        +String location
        +String affected_systems
        +String response_status
        +DateTime created_at
        +DateTime updated_at
        +DateTime closed_at
    }

    class CaseTriage {
        +String id
        +String case_id
        +String triage_status
        +String predicted_severity
        +Integer report_detail_score
        +String review_priority
        +Text summary
        +String model_name
        +DateTime evaluated_at
        +DateTime created_at
    }

    class Evidence {
        +String id
        +String case_id
        +String uploaded_by
        +String original_filename
        +String stored_filename
        +String file_path
        +String file_type
        +String mime_type
        +Integer file_size
        +String sha256_hash
        +String upload_status
        +DateTime uploaded_at
    }

    class CaseNote {
        +String id
        +String case_id
        +String author_id
        +Text content
        +Boolean is_public
        +DateTime created_at
    }

    class CustodyLog {
        +String id
        +String case_id
        +String evidence_id
        +String performed_by
        +String action
        +Text notes
        +String ip_address
        +DateTime timestamp
    }

    class Report {
        +String id
        +String case_id
        +String generated_by
        +String report_type
        +String file_path
        +String sha256_hash
        +DateTime generated_at
    }

    class ReporterDecision {
        <<custody event>>
        +String action
        +Text reason
        +DateTime timestamp
    }

    class TriageService {
        +predict_case_triage(title, type, description, has_evidence)
        +analyze_case_and_store(case_id)
        +mark_case_pending(case_id)
        +mark_case_unavailable(case_id)
    }

    class GeminiAPI {
        <<external service>>
        +generateContent(request)
        Returns structured advisory JSON
    }

    class Cloudinary {
        <<external service>>
        +upload authenticated image
        +create expiring signed URL
    }

    User "0..1" --> "0..*" Case : submits
    User "0..1" --> "0..*" Case : assigned to
    Case "1" *-- "0..1" CaseTriage : triage result
    Case "1" *-- "0..*" Evidence : evidence files
    Case "1" *-- "0..*" CaseNote : notes
    Case "1" --> "0..*" CustodyLog : audit events
    Case "1" --> "0..*" Report : reports
    Case "1" --> "0..*" ReporterDecision : decision history
    User "0..1" --> "0..*" Evidence : uploads
    User "1" --> "0..*" CaseNote : authors
    User "0..1" --> "0..*" CustodyLog : performs
    User "1" --> "0..*" Report : generates
    TriageService ..> CaseTriage : persists result
    TriageService ..> GeminiAPI : HTTPS request
    Evidence ..> Cloudinary : image if configured
```

`Case.severity` is the operational severity set by staff; `CaseTriage.predicted_severity` is a separate AI suggestion. `report_detail_score` is not a truthfulness score. `review_priority` is derived: `urgent` for high/critical predicted severity, `low` for other predictions with a report-detail score below 25, and `standard` otherwise. Existing databases migrate the legacy `authenticity_score` value into `report_detail_score` without dropping data.

## Sequence Diagram: Submission, Triage, Evidence, and Staff Workflow

```mermaid
sequenceDiagram
    actor Reporter
    actor Investigator
    actor Admin as Super Admin
    participant Web as React Web Client
    participant API as FastAPI API
    participant CaseSvc as Case Service
    participant TriageSvc as Triage Service
    participant Gemini as Gemini API
    participant EvidenceSvc as Evidence Service
    participant Cloud as Cloudinary
    participant PDF as ReportLab PDF Generator
    participant DB as SQLite Database

    Reporter->>Web: Submit incident form
    Web->>API: POST /api/cases/anonymous
    API->>CaseSvc: create_case(payload)
    CaseSvc->>DB: Insert case and case-created custody log
    CaseSvc-->>API: Case ID and case number
    API->>TriageSvc: Schedule background triage when key configured
    API-->>Web: 201 case created with case number

    opt Gemini API key configured
        TriageSvc->>DB: Create/update triage row as pending
        TriageSvc->>Gemini: generateContent(incident text, evidence presence)
        alt Valid structured response
            Gemini-->>TriageSvc: predicted severity, report detail score, summary
            TriageSvc->>TriageSvc: Derive urgent, standard, or low priority
            TriageSvc->>DB: Persist completed triage result
        else Timeout, provider error, or invalid response
            TriageSvc->>DB: Persist unavailable status and manual-review message
        end
    else Gemini not configured
        TriageSvc->>DB: Persist unavailable status
    end

    opt Reporter attached evidence
        Web->>API: POST /api/cases/{id}/evidence (multipart file)
        API->>EvidenceSvc: Validate size/type and compute SHA-256
        alt Image and Cloudinary configured
            EvidenceSvc->>Cloud: Upload authenticated asset
            Cloud-->>EvidenceSvc: Cloudinary public ID
        else Non-image or Cloudinary not configured
            EvidenceSvc->>EvidenceSvc: Store file locally
        end
        EvidenceSvc->>DB: Insert evidence metadata and hash
        EvidenceSvc->>DB: Append evidence-uploaded custody log
        API-->>Web: 201 evidence metadata and hash
    end

    alt Evidence request fails after case creation
        API-->>Web: Upload error
        Web->>Web: Keep case number and case ID
        Reporter->>Web: Retry file upload
        Web->>API: POST /api/cases/{same id}/evidence
    end

    Admin->>Web: Review queue ordered by AI priority
    Web->>API: GET /api/cases
    API->>DB: Read cases and triage rows
    API-->>Web: Case list with score, prediction, priority
    Admin->>Web: Assign case and optionally apply predicted severity
    Web->>API: PATCH /api/cases/{id} (assigned_to and/or severity)
    API->>CaseSvc: update_case(...)
    CaseSvc->>DB: Persist assignment/severity and audit event

    Investigator->>Web: Work assigned case, add notes/actions
    Web->>API: PATCH /api/cases/{id} (note/status)
    API->>CaseSvc: update_case(...)
    CaseSvc->>DB: Persist work and audit event
    Investigator->>Web: Submit completed case for review
    Web->>API: PATCH /api/cases/{id} status=under_review
    API->>CaseSvc: update_case(...)
    CaseSvc->>DB: Persist under_review status

    alt Admin approves
        Admin->>Web: Approve resolution
        Web->>API: POST /api/cases/{id}/review decision=approve
        API->>CaseSvc: review_case(...)
        CaseSvc->>DB: Set resolved and append audit event
    else Admin returns with required reason
        Admin->>Web: Return for further work with reason
        Web->>API: POST /api/cases/{id}/review decision=return, reason
        API->>CaseSvc: review_case(...)
        CaseSvc->>DB: Set in_progress, save internal note and audit event
        Investigator->>Web: Complete requested follow-up and resubmit
    end

    opt Admin approves resolution
        CaseSvc->>PDF: Build internal report from all staff notes and custody details
        PDF-->>CaseSvc: Internal PDF and SHA-256
        CaseSvc->>PDF: Build reporter copy from public notes and sanitized milestones
        PDF-->>CaseSvc: Reporter-safe PDF and SHA-256
        CaseSvc->>DB: Save both report records and report-generated custody events
    end

    Reporter->>Web: Track case and verify ownership
    Web->>API: GET public case using case number
    opt Reporter supplies ownership credential
        Web->>API: Send JWT or X-Case-Access-Token header
        API->>DB: Verify citizen ownership or anonymous token hash
        API-->>Web: Reporter actions and report availability
    end
    opt Resolution report available
        Web->>API: GET /api/public/cases/{number}/investigation-report with ownership credential
        API-->>Web: Reporter-safe PDF download
    end
    alt Reporter accepts result
        Reporter->>Web: Accept and close case
        Web->>API: POST decision action=accept
        API->>DB: Set closed and append reporter decision event
    else Reporter requests more justification
        Reporter->>Web: Submit explanation/transparency reason
        Web->>API: POST decision action=request_changes, reason
        API->>DB: Set in_progress and append request/reason event
    else Reporter withdraws active complaint
        Reporter->>Web: Withdraw complaint
        Web->>API: POST decision action=withdraw
        API->>DB: Set withdrawn and append withdrawal event
    end
```

## Activity Diagram: Case Intake and AI-Assisted Triage

```mermaid
flowchart TD
    Start((Start)) --> Intake[Reporter completes incident form]
    Intake --> Create[Create case and case-created audit event]
    Create --> ReturnID[Return case number and ID to web client]
    ReturnID --> HasFile{Evidence selected?}

    Create -. "background task" .-> HasKey{Gemini key configured?}
    HasKey -- No --> Unavailable[Save triage unavailable]
    HasKey -- Yes --> Pending[Save triage pending]
    Pending --> CallGemini[Request JSON prediction from Gemini]
    CallGemini --> GeminiOK{Valid response before timeout?}
    GeminiOK -- No --> Unavailable
    GeminiOK -- Yes --> SaveTriage[Save predicted severity, detail score, summary]
    SaveTriage --> Priority{Predicted severity high or critical?}
    Priority -- Yes --> Urgent[Set urgent queue priority]
    Priority -- No --> LowScore{Report detail score below 25?}
    LowScore -- Yes --> Low[Set lowest queue priority]
    LowScore -- No --> Standard[Set standard queue priority]

    HasFile -- No --> Queue[Case remains available to staff]
    HasFile -- Yes --> Validate[Validate extension, MIME and size]
    Validate --> Valid{File valid?}
    Valid -- No --> UploadError[Show upload error; retain case number]
    UploadError --> Retry{Reporter retries attachment?}
    Retry -- Yes --> Validate
    Retry -- No --> Queue
    Valid -- Yes --> IsCloud{Image and Cloudinary configured?}
    IsCloud -- Yes --> CloudStore[Upload authenticated image]
    IsCloud -- No --> LocalStore[Store file locally]
    CloudStore --> Hash[Compute/store file SHA-256]
    LocalStore --> Hash
    Hash --> EvidenceRecord[Save evidence row and custody event]
    EvidenceRecord --> Queue

    Unavailable --> Queue
    Urgent --> Queue
    Low --> Queue
    Standard --> Queue
    Queue --> AdminReview[Admin reviews case, AI signal, and report]
    AdminReview --> HumanSeverity[Admin chooses severity and investigator]
    HumanSeverity --> Investigation[Investigator works assigned case]
    Investigation --> SubmitReview[Investigator submits under_review]
    SubmitReview --> Decision{Admin review decision}
    Decision -- Approve --> Resolved[Set case resolved]
    Decision -- Return with reason --> Returned[Set in_progress and save reason note]
    Returned --> Investigation
```

## State Diagram: Case and AI Triage Lifecycles

```mermaid
stateDiagram-v2
    state "Case lifecycle" as CaseLifecycle {
        [*] --> Open
        Open --> InProgress : investigator starts work
        Open --> UnderReview : investigator submits for review
        Open --> Referred : staff refers case
        Open --> Closed : super admin closes
        InProgress --> UnderReview : investigator submits for review
        InProgress --> Referred : staff refers case
        InProgress --> Closed : super admin closes
        UnderReview --> Resolved : super admin approves
        UnderReview --> InProgress : super admin returns with required reason
        UnderReview --> Referred : staff refers case
        UnderReview --> Closed : super admin closes
        Referred --> InProgress : staff resumes work
        Referred --> UnderReview : staff submits for review
        Referred --> Closed : super admin closes
        Resolved --> Closed : super admin closes
        Resolved --> Closed : verified reporter accepts outcome
        Resolved --> InProgress : verified reporter requests changes with reason
        Closed --> InProgress : verified reporter requests changes with reason
        Open --> Withdrawn : verified reporter withdraws
        InProgress --> Withdrawn : verified reporter withdraws
        UnderReview --> Withdrawn : verified reporter withdraws
        Referred --> Withdrawn : verified reporter withdraws
        Closed --> [*]
        Withdrawn --> [*]
    }

    state "AI triage lifecycle (independent of case status)" as TriageLifecycle {
        [*] --> NotRequested
        NotRequested --> Pending : case created and Gemini configured
        NotRequested --> Unavailable : Gemini not configured
        Pending --> Complete : valid prediction saved
        Pending --> Unavailable : timeout, provider error, or invalid response
        Unavailable --> Pending : super admin retries with Gemini configured
        Complete --> Pending : super admin requests fresh analysis
        Complete --> [*]
        Unavailable --> [*] : case still proceeds to human review
    }
```

Case and triage states are independent: a case can be open or assigned while triage is pending or unavailable. An unavailable prediction never blocks the case workflow. Triage retry is super-admin-only. The ordinary admin queue ordering is urgent first, then standard, then low, with newest cases first inside each priority group; investigators see their assigned cases newest first.

## Implementation References

- Core case and triage models: [case.py](../backend/app/models/case.py), [case_triage.py](../backend/app/models/case_triage.py), [user.py](../backend/app/models/user.py)
- Evidence, notes, reports, and custody: [evidence.py](../backend/app/models/evidence.py), [case_note.py](../backend/app/models/case_note.py), [report.py](../backend/app/models/report.py), [custody_log.py](../backend/app/models/custody_log.py)
- AI scoring and priority derivation: [triage_service.py](../backend/app/services/triage_service.py)
- Case lifecycle, role filtering, and queue order: [case_service.py](../backend/app/services/case_service.py)
- Investigation PDF generation and SHA-256: [report_service.py](../backend/app/services/report_service.py)
- API endpoints: [cases.py](../backend/app/routes/cases.py), [evidence.py](../backend/app/routes/evidence.py), [auth.py](../backend/app/routes/auth.py)
- Public reporter tracking and decisions: [public.py](../backend/app/routes/public.py)
- Existing-database migration for the renamed score column: [database.py](../backend/app/database.py), [main.py](../backend/app/main.py)
