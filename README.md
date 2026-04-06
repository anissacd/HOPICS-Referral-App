# HOPICS Referral App

## Overview

HOPICS Referral App is a secure, agency-wide referral management system for HOPICS, serving South Central and SPA 6 clients experiencing homelessness and needing supportive services. The app provides staff, managers, and admins with a single place to create, track, update, and communicate about referrals while enforcing agency-only access and accountability.

---

## Key Features

- **Google SSO Authentication**
  - Single sign-on with Google for agency staff only
  - Restricts access to HOPICS-approved Google accounts
  - Ensures secure sign-in and consistent identity across users

- **Referral Management**
  - Create, view, and update referrals for clients in need
  - Track referral source, service category, client demographics, assessment notes, and status history
  - Only admins may permanently delete referrals
  - Staff and managers may update referrals as they are worked

- **Dashboard & Analytics**
  - Total referrals at a glance
  - Referral status distribution: pending, in progress, completed, closed
  - Average days until a referral is no longer pending
  - Performance goal tracking for a 3-day pending threshold
  - Trend charts for referral inflow and resolution activity
  - Alerts for referrals that remain pending too long

- **Collaboration & Communication**
  - Built-in referral chat and messaging
  - Case-specific conversation threads on each referral
  - Direct staff-to-staff messages for coordination
  - Notifications for assignments, updates, and new messages

- **Role-Based Access Control**
  - Admins: full system control, user management, referral deletions, settings
  - Managers: team oversight, referral updates, analytics review, escalation decisions
  - Staff: referral creation, progress updates, client follow-up, communications

- **Tracking & Accountability**
  - Audit logs on every referral action and message
  - Timestamped status changes and updates
  - Referral history and change reason tracking
  - Service progress notes preserved per case

---

## User Roles

### Admin
- Manage users and access permissions
- Delete referrals when necessary
- Review system-wide analytics and audit history
- Configure application settings and workflows

### Manager
- Oversee referral workflow and team caseloads
- Update referral details and approve escalations
- Monitor performance and pending referral goals
- Review referral analytics and service trends

### Staff
- Create new referrals and capture client needs
- Update referral progress, status, and notes
- Communicate with colleagues using referral chat
- Track assigned referrals and actions required

---

## Referral Lifecycle

1. **Referral Created**
   - Staff submits client intake information, referral type, assessment notes, and supporting details
2. **Pending**
   - Referral waits for assignment, review, or next action
   - Dashboard measures time pending against the 3-day target
3. **In Progress**
   - Referral is actively being worked by staff or manager
   - Updates, notes, and chat entries are added to the case
4. **Completed / Closed**
   - Referral outcome is recorded when services are delivered or the case resolves
   - Final disposition and follow-up notes are archived

---

## Dashboard Metrics

- **Total Referrals** across the agency and service areas
- **Referrals by Status** to highlight bottlenecks
- **Average Pending Time** compared to the 3-day goal
- **Goal Progress** for moving referrals out of pending status fast
- **Staff Workload** and assignment distribution
- **Message Activity** for active collaboration
- **Referral Source** and service type breakdowns
- **Trend Charts** for referrals over time and outcome pacing

---

## Messaging & Chat

- **Referral Chat**
  - Each referral has its own secure message thread
  - Staff collaborate directly within the case context
- **Direct Messaging**
  - One-to-one conversations between agency staff
- **Notifications**
  - Real-time alerts for new messages, referral changes, and assignments
- **Message History**
  - Preserved in referral audit logs for later review and accountability

---

## Security & Compliance

- Google SSO ensures only agency staff can sign in
- Role-based permissions guard referral data and actions
- Admin-only deletion protects data integrity
- Audit logs capture every referral update, status change, and message
- Client and case data remain secure under agency access controls

---

## How to Use

1. Sign in with your HOPICS Google account
2. Open the referral dashboard
3. Create or search referrals for clients in South Central and SPA 6
4. Assign referrals, update statuses, add notes, and collaborate
5. Use referral chat to coordinate service delivery
6. Watch pending time metrics and goal progress on the dashboard
7. Admins manage deletion and user access

---

## Benefits

- Centralized referral tracking for the agency
- Faster case resolution with real-time metrics
- Clear accountability across staff, managers, and admins
- Built-in communication for better coordination
- Secure access through agency Google SSO

---

## Future Enhancements

- Mobile-friendly referral intake and case review
- Client-facing portal for status updates and notifications
- Automated reminders for pending referrals beyond 3 days
- Predictive analytics for service demand and referral volume
- Integration with partner homelessness service providers

---

## Notes

This README documents the vision for the HOPICS Referral App, describing secure access, referral workflows, analytics, messaging, and accountability needed to support homelessness and supportive services work in South Central and SPA 6.
