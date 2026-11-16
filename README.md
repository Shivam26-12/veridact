# VERIDACT

> **Cybersecurity Incident Reporting and Management System**  
> Incident reporting, severity assessment, investigation tracking, response workflows, and audit logs.

---

## 🛡️ Overview

**VERIDACT** is a full-stack Software Engineering (SE) project designed for cybersecurity incident lifecycle management. The system enables organizations and security teams to efficiently handle cyber incidents through standard Computer Security Incident Response (CSIR) operations: from citizen/employee incident intake, automated severity assessment and triage, through investigation tracking, response workflows (containment, eradication, recovery, notification), to cryptographic audit trails and comprehensive post-incident reporting.

---

## 🛠️ Tech Stack

Veridact is built using a modern, scalable, and secure software engineering stack:

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts (for SOC incident analytics), React Hook Form, Zod
- **Backend API**: Python 3.12+, FastAPI, SQLAlchemy 2.0 (ORM), Pydantic v2
- **Database**: SQLite (Development) / PostgreSQL (Production)
- **Security & Cryptography**: JWT Bearer Tokens, Bcrypt password hashing, SHA-256 evidence integrity hashing and immutable chain-of-custody logging

---

## ✨ Core Pillars & Features

### 1. Incident Reporting & Ingestion
- **Public & Authenticated Reporting**: Multi-step guided wizard for submitting incidents (phishing, ransomware, data breach, DDoS, malware, unauthorized access, insider threat, web app attacks, etc.).
- **Evidence Collection**: File attachments (log files, network captures `.pcap`, screenshots, suspicious emails `.eml`, documents) secured with deterministic SHA-256 integrity hashing.
- **Anonymous Tracking**: Public incident tracking endpoint returning sanitized status and response timeline without leaking sensitive IOCs.

### 2. Severity Assessment & Triage
- **Structured Severity Levels**: `Low`, `Medium`, `High`, and `Critical`.
- **System Impact Scoping**: Tracks affected systems, hostnames, and IP subnets.
- **Supervisor Triage**: Supervisors prioritize incoming incidents and assign designated investigators.

### 3. Investigation Tracking
- **Central Incident Dashboard**: Real-time status tracking (`open`, `in_progress`, `under_review`, `resolved`, `closed`, `referred`).
- **Investigator Workload Management**: Role-based case assignment and progress monitoring.
- **Evidence Management**: View cryptographic integrity hashes, file metadata, and case notes.

### 4. Response Workflows
- **Incident Response Stages**: Structured containment, eradication, recovery, authority notification, and escalation workflows.
- **Workflow Action Logging**: Every response action is tracked with timestamp and investigator ID via dedicated API endpoints (`/api/incidents/{case_id}/response`).

### 5. Audit Logs & Chain of Custody
- **Immutable Audit Trail**: Every incident creation, status update, severity modification, assignment change, evidence upload, and access is recorded in `custody_logs`.
- **Accountability**: Actor identity, action type, SHA-256 hash, and timestamps recorded for post-incident compliance reviews.

### 6. Incident Reporting & Analytics
- **Executive & SOC Metrics**: Influx rates, resolution velocity, severity distributions, and investigator workload visualizations via Recharts.
- **Formal Reports**: Generation of post-incident review documents and summaries.

---

## 👤 User Roles & Access Control

The platform enforces strict Role-Based Access Control (RBAC):

* **Super Admin**: System configuration, user account management, full custody audit access, incident soft-close.
* **Supervisor**: Incident triage, severity assessment, investigator assignment, SOC department analytics.
* **Investigator**: Incident investigation, evidence inspection, response action logging, notes and report generation.
* **Citizen / Reporter**: Submit incident reports (public wizard or authenticated) and track incident status using the incident tracking number (`INC-YYYY-NNNNNN`).

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js 18+ & npm
- Python 3.10+ & virtual environment

### 1. Backend Setup
```bash
cd backend

# Create virtual environment & activate
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies (no ML libraries required)
pip install -r requirements.txt

# Seed the database with demo users and sample incidents
python seed.py --reset

# Run backend API server (runs at http://localhost:8000)
python run.py
```

To store uploaded images in Cloudinary, copy `backend/.env.example` to `backend/.env` and paste the value after `CLOUDINARY_URL=` from Cloudinary Dashboard > API Keys. The value must include the API key, API secret, and cloud name (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`); an API key alone is not enough for private server uploads. Keep `backend/.env` secret. Image evidence is uploaded as authenticated assets and staff preview links expire after 15 minutes. Without a Cloudinary URL, uploads continue to use local disk storage.

For AI-assisted case triage, set `GEMINI_API_KEY` in `backend/.env` and restart the backend. Gemini predicts severity and provides a report-detail/verifiability score; the score is not a probability that a complaint is true or false. Low-detail cases are highlighted for lower review priority, while predicted high/critical severity remains urgent. Admins can apply the predicted severity or retry unavailable analysis. If Gemini is unavailable, case reporting and human review continue normally.

When a super admin approves an investigator's resolution, VERIDACT generates separate staff and reporter investigation PDFs. The reporter PDF excludes internal notes and private log details. Anonymous reporters receive a one-time access code on the submission receipt; keep it private because it authorizes report download, acceptance, reopening requests, and withdrawal. On the tracking page, reporters can accept and close a resolved case, request additional justification/transparency (with a required explanation), or withdraw an active complaint.

### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server (runs at http://localhost:5173)
npm run dev
```

---

## 🔑 Demo Credentials

All seeded demo accounts use the password: `demo1234`

| Role | Email | Name |
|---|---|---|
| Super Admin | `admin@veridact.com` | System Administrator |
| Supervisor | `supervisor@veridact.com` | Priya Sharma |
| Investigator | `inv1@veridact.com` | Officer Ram Shrestha |
| Investigator | `inv2@veridact.com` | Officer Sita Rai |
| Citizen | `citizen1@veridact.com` | Arjun Thapa |
| Citizen | `citizen2@veridact.com` | Nisha Gurung |

---

## 📡 API Endpoints Overview

- `POST /api/auth/login` - Authenticate and obtain JWT token
- `GET /api/cases` - List incidents with role-based filtering, search, severity, and status filters
- `POST /api/cases` - Create an incident (authenticated)
- `POST /api/cases/anonymous` - Submit incident report without authentication
- `GET /api/cases/{case_id}` - Retrieve detailed incident data, evidence list, and investigation notes
- `PATCH /api/cases/{case_id}` - Update incident status, severity, or investigator assignment
- `POST /api/incidents/{case_id}/response` - Log response actions (contain, eradicate, recover, notify, escalate)
- `GET /api/incidents/{case_id}/timeline` - Retrieve full chronological audit timeline
- `POST /api/cases/{case_id}/evidence` - Upload evidence files with SHA-256 verification
- `GET /api/public/cases/{case_number}` - Public citizen tracking endpoint
- `GET /api/admin/users` - Admin user management
- `GET /api/admin/custody` - System-wide audit log
- `GET /api/admin/analytics` - SOC analytics overview

## Software Modelling

Project UML-oriented use-case, class, sequence, activity, and case-state diagrams are documented in [docs/07_SOFTWARE_MODELLING.md](docs/07_SOFTWARE_MODELLING.md).

## SRS and Engineering Report

The system requirements, stakeholder analysis, architecture, quality assurance, project plan, and maintenance guidance are documented in [docs/08_SRS_REQUIREMENTS_AND_ENGINEERING_REPORT.md](docs/08_SRS_REQUIREMENTS_AND_ENGINEERING_REPORT.md).
