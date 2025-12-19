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

Last updated: December 19, 2025

Welcome to Divan ("we", "our", or "us"). We believe that the foundation of a great community is trust, and that trust starts with being transparent about how we handle your personal information. This Privacy Policy details the data we collect, why we collect it, and the robust measures we take to keep it secure.
```

#### 2. Information We Collect

| Category | What we collect | Purpose |
| :--- | :--- | :--- |
| **Account Essentials** | Email, username, password (hashed) | Authentication, account management, and security. |
| **Profile Identity** | Display name, bio, interests, university, photo | Personalizing your profile and connecting with peers. |
| **Community Activity** | Messages, posts, interactions, friend connections | Powering social features and community engagement. |
| **Technical Logs** | IP address, device info, browser version | Preventing fraud, security, and optimization. |
| **Proximity Data** | Approximate location (if enabled) | Discovery features (7-day retention). |

#### 3. How We Use Information

| Primary Purpose | Data Categories Used | Legal Basis |
| :--- | :--- | :--- |
| **Service Operation** | Account Essentials, Profile Identity | Contractual Necessity |
| **Safety & Security** | Technical Logs, Account Essentials | Legitimate Interest |
| **Social Matching** | Profile Identity, Interests | Consent |
| **Proximity Features** | Proximity Data | Explicit Consent (Opt-in) |
| **Platform Analytics** | Aggregated Activity Data (Anonymized) | Legitimate Interest |

#### 4. Data Sharing

```markdown
## 3. Data Sharing

We do not sell your personal information. We only share data in these limited circumstances:

1. **At Your Request** — When you explicitly authorize us.
2. **Reliable Service Providers** — Trusted partners for cloud hosting/email (under strict DPA).
3. **Legal Obligations** — When required by a valid legal process.
4. **Urgent Safety Matters** — To prevent imminent physical harm.
```

#### 5. Data Retention

| Data Type | Retention Period | Post-Retention Action |
| :--- | :--- | :--- |
| **Active Account Profile** | Duration of active account | N/A |
| **Closed Account Data** | 30-day grace period | Permanent deletion |
| **Chat & Messages** | 365 days | Automatic purging |
| **Proximity Logs** | 7 days | Automatic purging |
| **Security Logs** | 180 days | Automatic purging |

#### 6. User Rights

| Your Right | What it means | How to exercise it |
| :--- | :--- | :--- |
| **Access & Portability** | Download a copy of your data (JSON). | Settings → Privacy → Export Data |
| **Rectification** | Fix inaccurate profile info. | Edit Profile in Settings |
| **Erasure** | Request complete deletion of account. | Settings → Account → Delete Account |
| **Withdrawal** | Opt-out of optional data collection. | Settings → Privacy |

#### 7. Security Measures

| Protection Layer | Security Mechanism |
| :--- | :--- |
| **Transport Security** | TLS 1.3 encryption for all data in transit. |
| **Storage Security** | AES-256 encryption at rest for volumes and backups. |
| **Credential Protection** | Argon2id password hashing. |
| **Authentication** | Support for 2FA (TOTP) and Passkeys. |
| **Access Control** | Strict RBAC and audit logging. |

#### 8. Children's Privacy

```markdown
## 7. Children's Privacy

Divan is for adults (18+). We do not knowingly collect info from children. 
Accounts found to be held by minors will be terminated immediately.
```

#### 9. International Users

```markdown
## 8. International Data Transfers

Data is primarily processed in Canada. International transfers are 
protected by standard contractual clauses or similar legal safeguards.
```

#### 10. Updates & Contact

```markdown
## 10. Contact Us

For privacy questions:
- **Contact us:** unihoodapp@gmail.com
- Help Center: In-app contact option

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
