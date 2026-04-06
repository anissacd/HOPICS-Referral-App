# HOPICS Referral App

A secure, agency-wide referral management system for HOPICS staff serving clients experiencing homelessness in South Central / SPA 6.

**Live App:** https://anissacd.github.io/HOPICS-Referral-App

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Plain HTML, CSS, JavaScript (no framework) |
| Backend | Google Apps Script (Web App) |
| Database | Google Sheets (4 sheets: Referrals, Clients, Messages, Users) |
| Auth | Google OAuth 2.0 (redirect flow) |
| Hosting | GitHub Pages |
| Email | Gmail via MailApp in Apps Script |

---

## Pages

| Page | Purpose |
|------|---------|
| `login.html` | Google SSO sign-in — authorized staff only |
| `dashboard.html` | Stats, program flow tracking, recent referrals |
| `referral.html` | Create new referral — client search, HMIS ID input, From→To program flow |
| `client-profile.html` | Client detail view — referral history, goals, case notes, editable fields |
| `clients.html` | Client roster — searchable list with HMIS ID badges |
| `my-referrals.html` | Staff's own referral list with edit capability |
| `messages.html` | Internal messaging — threads load from Google Sheets, email alerts on new message |
| `admin.html` | Admin panel — user management, program list, activity log |

---

## Google Apps Script Setup

The backend is a Google Apps Script deployed as a Web App.

**Script file:** `google-apps-script-updated.js`

**One-time setup steps:**

1. Open your Google Sheet → **Extensions → Apps Script**
2. Paste the full contents of `google-apps-script-updated.js`
3. Click **Save**
4. Click **Deploy → New deployment**
   - Type: Web App
   - Execute as: Me
   - Who has access: Anyone
5. Copy the deployment URL and confirm it matches the `GAS_URL` constant in each HTML file
6. Run `setupDailyTrigger()` once from the editor to activate 3-day overdue referral email alerts
7. Run `initializeSheets()` once to create the 4 required sheet tabs

**Add yourself as the first admin:**
In the Users sheet, add a row:
| Email | Name | Role | Status |
|-------|------|------|--------|
| your@email.com | Your Name | admin | active |

---

## Google OAuth Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Type: Web application
   - Authorized JavaScript origins: `https://anissacd.github.io`
   - Authorized redirect URIs: `https://anissacd.github.io/HOPICS-Referral-App/login.html`
3. Copy the Client ID into `login.html` → `const CLIENT_ID = '...'`
4. Go to **Google Auth Platform → Audience → Add test users** (your email) while in Testing mode

---

## Google Sheets Structure

**Referrals sheet** (16 columns):
`ID | Timestamp | HMIS ID | Client Name | DOB | Is Existing | From Program | To Program | How Found | Service Category | Urgency | Submitted By | Assessment Notes | Status | Last Updated | Staff Email`

**Clients sheet** (8 columns):
`HMIS ID | Name | DOB | Housing Status | Program | Case Manager | Date Added | Last Updated`

**Messages sheet** (8 columns):
`Message ID | Thread ID | Thread Type | Timestamp | From | To | Message | Is Read`

**Users sheet** (7 columns):
`Email | Name | Role | Status | Date Added | Last Login | Added By`

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access — user management, admin panel |
| `supervisor` | Team oversight, all referrals |
| `case_manager` | Create/edit own referrals, messaging |
| `intake_coordinator` | Referral intake |
| `outreach_worker` | Outreach referrals |
| `read_only` | View only |

---

## HIPAA Notice

This system handles protected health information (PHI). Access is restricted to authorized HOPICS agency staff via Google SSO. Do not share login credentials or client data outside secure agency channels.
