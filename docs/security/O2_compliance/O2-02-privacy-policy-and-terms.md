# O2-02: Privacy Policy & Terms of Service

> Status: ⚠️ **Required Before Launch** — Legal documents must be drafted and reviewed

## Overview

This document outlines the requirements for Privacy Policy and Terms of Service that align with actual platform data practices documented in the security specs.

## Privacy Policy Requirements

### PIPEDA Compliance Checklist

| Principle | Requirement | Implementation |
|-----------|-------------|----------------|
| **Accountability** | Designate privacy officer | [ ] Assign DPO |
| **Identifying Purposes** | State why data is collected | [ ] Draft policy |
| **Consent** | Obtain meaningful consent | [ ] Consent flows |
| **Limiting Collection** | Collect only what's needed | ✅ Minimal data |
| **Limiting Use** | Use only for stated purposes | [ ] Audit uses |
| **Accuracy** | Keep data accurate | ✅ User can edit |
| **Safeguards** | Protect data appropriately | ✅ Encryption |
| **Openness** | Be transparent about practices | [ ] Policy page |
| **Individual Access** | Allow users to see their data | ✅ Export endpoint |
| **Challenging Compliance** | Allow complaints | [ ] Contact info |

### Required Sections

#### 1. Introduction

```markdown
# Privacy Policy

Last updated: [DATE]

Divan ("we", "our", "us") is committed to protecting your privacy. 
This policy explains how we collect, use, and protect your personal 
information when you use our platform.
```

#### 2. Information We Collect

| Category | Data | Source | Purpose |
|----------|------|--------|---------|
| **Account** | Email, name, username | User provided | Account creation |
| **Profile** | Avatar, bio, interests | User provided | Profile display |
| **Authentication** | Password hash, 2FA | User provided | Security |
| **Activity** | Posts, messages, reactions | User activity | Core service |
| **Technical** | IP, device, browser | Automatic | Security/debugging |
| **Location** | Proximity (optional) | User permission | Discovery feature |

**Must disclose:**
- What personal information is collected
- Whether collection is mandatory or optional
- How it's collected (directly, automatically)

#### 3. How We Use Information

| Use Case | Data Used | Legal Basis |
|----------|-----------|-------------|
| Provide service | Account, profile | Contract |
| Authenticate | Credentials, 2FA | Contract |
| Match users | Profile, interests | Consent |
| Location features | GPS coordinates | Consent |
| Security | IP, device fingerprint | Legitimate interest |
| Analytics | Aggregated usage | Legitimate interest |
| Communications | Email | Consent |

**Must explain:**
- Each purpose for data use
- How purposes relate to service
- How to opt-out where applicable

#### 4. Data Sharing

```markdown
## When We Share Your Information

We do not sell your personal information. We share data only:

1. **With your consent** — When you explicitly agree
2. **Service providers** — Cloud hosting, email services
3. **Legal requirements** — When required by law
4. **Safety** — To protect users from harm

### Third-Party Services

| Provider | Purpose | Data Shared |
|----------|---------|-------------|
| AWS/GCP | Hosting | All encrypted |
| SendGrid | Email | Email address |
| Sentry | Error tracking | Error context |
```

#### 5. Data Retention

Reference `O2-01-data-retention-and-subpoena-policy.md`:

```markdown
## How Long We Keep Your Data

| Data Type | Retention Period |
|-----------|-----------------|
| Profile (active account) | While account active |
| Profile (deleted account) | 30 days grace period |
| Messages | 365 days |
| Location history | 7 days |
| Session logs | 180 days |
| Analytics | 90 days |

After deletion, data is permanently removed from our systems 
and backups within 90 days.
```

#### 6. User Rights

```markdown
## Your Rights

You have the right to:

1. **Access** — Request a copy of your data (Settings → Privacy → Export)
2. **Correction** — Update inaccurate information (Edit profile)
3. **Deletion** — Delete your account (Settings → Account → Delete)
4. **Portability** — Export in machine-readable format (JSON)
5. **Withdraw consent** — Disable optional data collection
6. **Complain** — Contact us or the Privacy Commissioner

### How to Exercise Your Rights

- **Export data:** Settings → Privacy → Export Data
- **Delete account:** Settings → Account → Delete Account
- **Privacy settings:** Settings → Privacy
- **Contact us:** privacy@divan.example.com
```

#### 7. Security Measures

```markdown
## How We Protect Your Data

- **Encryption in transit:** TLS 1.3 for all connections
- **Encryption at rest:** AES-256 for stored data
- **Password security:** Argon2id hashing (industry standard)
- **Access control:** Role-based access, audit logging
- **Monitoring:** 24/7 security monitoring
- **Incident response:** Documented procedures

We regularly review our security practices and work with 
security researchers through our bug bounty program.
```

#### 8. Children's Privacy

```markdown
## Children's Privacy

Divan is not intended for users under 18 years of age. 
We do not knowingly collect personal information from children.

If you believe a child has provided us personal information, 
please contact us immediately.
```

#### 9. International Users

```markdown
## International Data Transfers

Your data may be processed in Canada and other countries. 
When we transfer data internationally, we ensure appropriate 
safeguards are in place:

- Standard contractual clauses
- Adequacy decisions
- Service provider agreements
```

#### 10. Updates & Contact

```markdown
## Policy Updates

We may update this policy. Material changes will be:
- Announced via email
- Highlighted in the app
- Effective 30 days after notice

## Contact Us

For privacy questions:
- Email: privacy@divan.example.com
- Mail: [Physical address]
- Privacy Officer: [Name]

For complaints: Office of the Privacy Commissioner of Canada
```

## Terms of Service Requirements

### Required Sections

#### 1. Acceptance of Terms

```markdown
# Terms of Service

Last updated: [DATE]

By accessing or using Divan, you agree to these Terms of Service 
and our Privacy Policy. If you disagree, do not use the service.
```

#### 2. Eligibility

```markdown
## Eligibility

To use Divan, you must:
- Be at least 18 years old
- Have the legal capacity to enter into contracts
- Not be prohibited from using the service under applicable law
- Provide accurate registration information
```

#### 3. Account Responsibilities

```markdown
## Your Account

You are responsible for:
- Maintaining account security
- All activity under your account
- Keeping your contact information current
- Notifying us of unauthorized access

We may suspend or terminate accounts that violate these terms.
```

#### 4. User Conduct

```markdown
## Acceptable Use

You agree NOT to:
- Harass, bully, or threaten other users
- Post illegal, harmful, or offensive content
- Impersonate others or misrepresent your identity
- Use the service for illegal purposes
- Attempt to gain unauthorized access
- Interfere with platform operation
- Violate others' privacy or intellectual property

We reserve the right to remove content and suspend accounts 
at our discretion.
```

#### 5. Content Ownership

```markdown
## Content

**Your Content:** You retain ownership of content you post. 
By posting, you grant us a license to display, distribute, 
and modify (for formatting) your content on the platform.

**Our Content:** The Divan platform, logos, and features are 
our property. You may not copy or use them without permission.

**User-to-User:** Content shared between users belongs to the 
original creator. Recipients may not redistribute without consent.
```

#### 6. Service Modifications

```markdown
## Changes to Service

We may modify, suspend, or discontinue features at any time. 
We'll provide reasonable notice for material changes.

We are not liable for any modification or discontinuation.
```

#### 7. Disclaimers

```markdown
## Disclaimers

THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.

We do not guarantee:
- Uninterrupted or error-free operation
- That content is accurate or appropriate
- That users are who they claim to be
- Any specific outcomes from using the service

You use the service at your own risk.
```

#### 8. Limitation of Liability

```markdown
## Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW:

We are not liable for:
- Indirect, incidental, or consequential damages
- Lost profits, data, or opportunities
- User conduct or content
- Third-party services

Our total liability is limited to the amount you paid us 
in the 12 months before the claim, or $100, whichever is greater.
```

#### 9. Indemnification

```markdown
## Indemnification

You agree to indemnify and hold harmless Divan and its 
affiliates from claims arising from:
- Your use of the service
- Your content
- Your violation of these terms
- Your violation of any rights of another party
```

#### 10. Dispute Resolution

```markdown
## Disputes

**Governing Law:** These terms are governed by the laws of 
[Province], Canada.

**Arbitration:** Disputes will be resolved through binding 
arbitration under [Rules], except for:
- Small claims court matters
- Intellectual property disputes
- Injunctive relief

**Class Action Waiver:** You agree to resolve disputes 
individually, not as part of a class action.
```

#### 11. Termination

```markdown
## Termination

You may terminate by deleting your account.

We may terminate for:
- Terms violations
- Illegal activity
- Extended inactivity (with notice)
- Service discontinuation

Upon termination, your license to use the service ends. 
Sections that should survive (liability, disputes) will survive.
```

## Implementation Plan

### Phase 1: Draft (Week 1-2)

1. [ ] Review all data collection and use in codebase
2. [ ] Map data flows to privacy policy sections
3. [ ] Draft Privacy Policy
4. [ ] Draft Terms of Service
5. [ ] Internal legal review

### Phase 2: Legal Review (Week 3-4)

1. [ ] Engage external legal counsel
2. [ ] PIPEDA compliance review
3. [ ] Incorporate feedback
4. [ ] Final legal sign-off

### Phase 3: Implementation (Week 5)

1. [ ] Create `/privacy` and `/terms` pages
2. [ ] Add consent checkboxes to registration
3. [ ] Add policy links to footer
4. [ ] Set up policy update notification system
5. [ ] Create policy version history

### Phase 4: Ongoing (Post-Launch)

1. [ ] Schedule annual policy review
2. [ ] Update when features change
3. [ ] Track consent versions
4. [ ] Maintain update notification system

## Technical Implementation

### Policy Pages

```tsx
// frontend/app/legal/page.tsx

export default function LegalIndexPage() {
  return (
    <div className="legal-nav">
      <h1>Legal Documents</h1>
      <ul>
        <li><Link href="/privacy">Privacy Policy</Link></li>
        <li><Link href="/terms">Terms of Service</Link></li>
        <li><Link href="/cookies">Cookie Policy</Link></li>
      </ul>
    </div>
  );
}
```

### Consent Tracking

```sql
CREATE TABLE user_consents (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    consent_type VARCHAR(50) NOT NULL,
    policy_version VARCHAR(20) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT
);

-- Track which policy version users agreed to
CREATE INDEX idx_consents_user ON user_consents(user_id);
CREATE INDEX idx_consents_type ON user_consents(consent_type, policy_version);
```

### Policy Version Management

```python
# backend/app/domain/legal/policies.py

CURRENT_POLICIES = {
    "privacy": "1.0.0",
    "terms": "1.0.0",
    "cookies": "1.0.0",
}

async def check_policy_acceptance(user_id: UUID) -> dict:
    """Check if user has accepted current policies."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        accepted = await conn.fetch("""
            SELECT consent_type, policy_version
            FROM user_consents
            WHERE user_id = $1
              AND revoked_at IS NULL
        """, user_id)
        
        accepted_map = {r["consent_type"]: r["policy_version"] for r in accepted}
        
        return {
            policy: accepted_map.get(policy) == version
            for policy, version in CURRENT_POLICIES.items()
        }

async def record_consent(
    user_id: UUID,
    consent_type: str,
    ip_address: str,
    user_agent: str,
):
    """Record user's consent to a policy."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_consents 
            (id, user_id, consent_type, policy_version, granted_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, NOW(), $5, $6)
        """, uuid4(), user_id, consent_type, CURRENT_POLICIES[consent_type], ip_address, user_agent)
```

## Required Before Launch

- [ ] Privacy Policy drafted and legally reviewed
- [ ] Terms of Service drafted and legally reviewed
- [ ] Cookie Policy (if using cookies) drafted
- [ ] Consent collection implemented on registration
- [ ] Policy pages live at `/privacy`, `/terms`
- [ ] Footer links to legal pages
- [ ] Policy update notification system ready
- [ ] Consent tracking database table created

## Resources

- [Office of the Privacy Commissioner of Canada - PIPEDA](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/)
- [PIPEDA Fair Information Principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/)
- [Provincial Privacy Laws](https://www.priv.gc.ca/en/about-the-opc/what-we-do/provincial-and-territorial-collaboration/provincial-and-territorial-privacy-laws-and-oversight/)
