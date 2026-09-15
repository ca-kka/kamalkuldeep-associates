# KKA Client Portal — Compliance Baseline

Effective review date: 15 September 2026

This file records the technical baseline implemented for the private KKA Client Portal. It is an engineering/control record, not a legal opinion or certification.

## Implemented in the portal

- Private authenticated client/staff workspace.
- Server-side role and client entitlement controls backed by Supabase RLS.
- Client account activation/deactivation controls.
- Controlled document upload, review and duplicate handling.
- Audit trail for material portal activity.
- Soft deletion where traceability requires retaining an audit record.
- Privacy acknowledgement on new portal-access requests.
- Publicly reachable portal Privacy & Data Protection Notice, Security & Incident Response Notice, and Portal Terms.
- Baseline security response headers for Cloudflare Pages.
- Explicit statement that no ISO 27001, SOC 2, STQC, DPDP or other certification is claimed unless separately obtained.
- OneDrive registry trigger hardened with a fixed PostgreSQL search path.

## Operational controls still required outside application code

### CERT-In

KKA must maintain the required ICT/security logs for the applicable retention period, including the 180-day requirement where applicable, protect those logs, designate the appropriate point of contact, and maintain a process for reporting applicable cyber incidents within the prescribed timeframe, including the applicable six-hour reporting requirement.

Application `audit_logs` are not a substitute for infrastructure, authentication, network, cloud or security-provider logs.

### Authentication

Supabase Auth's leaked-password protection should be enabled in the Supabase Auth configuration. This is an account/project-level control and should not be simulated in frontend code.

### Incident response

KKA should maintain an internal incident-response contact, escalation path, evidence-preservation procedure and regulatory/customer notification procedure appropriate to the incidents it handles.

### Retention

KKA should maintain an engagement-aware retention schedule covering tax/accounting/professional records, security logs and documents subject to legal, audit or litigation holds. The portal must not automatically delete records merely because a generic application retention period has elapsed.

### ICAI

The public KKA website and professional communications should be reviewed against the revised 13th Edition of the ICAI Code of Ethics applicable from 1 April 2026. The private portal should not be used to make professional advertising or certification claims that have not been approved under applicable ICAI requirements.

## Certification position

No statutory requirement identified in this engineering review requires KKA to obtain ISO 27001, SOC 2 or STQC certification merely to operate this private client portal. Certification may be pursued separately if commercially or contractually useful.
