# S6-01: Penetration Test Scope

> Status: 📋 **Planning** — Define before engaging pentest firm

## Goals

- Define clear targets, exclusions, and rules of engagement
- Ensure comprehensive coverage without disrupting production
- Establish communication and emergency procedures

## Scope Definition

### In-Scope Targets

#### 1. Web Application (Primary)

| Target | Environment | Description |
|--------|-------------|-------------|
| `app.divan.com` | Production | Main web application |
| `staging.divan.com` | Staging | Full replica for testing |
| `api.divan.com` | Production | REST API endpoints |

#### 2. API Endpoints

| Category | Endpoints | Priority |
|----------|-----------|----------|
| **Authentication** | `/api/auth/*` | Critical |
| **Sessions** | `/api/security/sessions/*` | Critical |
| **User Data** | `/api/account/*`, `/api/profile/*` | High |
| **Chat/Messaging** | `/api/chat/*` | High |
| **Communities** | `/api/community/*` | Medium |
| **Real-time** | WebSocket connections | High |

#### 3. Authentication Flows

- Email/password login
- Refresh token rotation
- 2FA (TOTP) enrollment and verification
- Password reset flow
- Passkey/WebAuthn authentication
- Session management (list, revoke)

#### 4. WebSocket/Real-time

- Socket.IO authentication
- Presence/proximity features
- Chat delivery

### Out of Scope (Exclusions)

| System | Reason |
|--------|--------|
| Third-party services (Stripe, SendGrid) | Vendor responsibility |
| CDN/DNS infrastructure | Provider managed |
| Mobile apps | Not yet released |
| Physical security | Out of scope |
| Social engineering | Requires separate engagement |
| DoS/DDoS testing | Requires coordination |

### Test Types Authorized

| Test Type | Authorized | Notes |
|-----------|------------|-------|
| OWASP Top 10 | ✅ | All categories |
| Business logic | ✅ | Focus on auth, permissions |
| API testing | ✅ | All documented endpoints |
| Authentication bypass | ✅ | All auth methods |
| Authorization (IDOR) | ✅ | Critical focus area |
| Session management | ✅ | Token handling |
| Input validation | ✅ | XSS, SQLi, etc. |
| Rate limit testing | ✅ | Controlled |
| Data exposure | ✅ | PII, secrets |
| File upload | ✅ | If applicable |

## Rules of Engagement

### Testing Windows

| Environment | Window | Rate Limits |
|-------------|--------|-------------|
| **Staging** | 24/7 | Unrestricted |
| **Production** | Mon-Fri 2-6 AM EST | Max 50 req/sec |

### Authorized Actions

✅ **Permitted:**
- Create test accounts (use `@pentest.divan.com` domain)
- Attempt authentication bypass
- Test for injection vulnerabilities
- Enumerate APIs
- Attempt privilege escalation
- Access own test data
- Modify own test data

❌ **Not Permitted:**
- Access real user data
- Modify production database directly
- Denial of service attacks
- Data exfiltration beyond proof of concept
- Persistence mechanisms (backdoors)
- Attacking infrastructure (AWS, Vercel)
- Social engineering staff

### Test Account Credentials

Provide to pentest team:
```
Email: pentester1@pentest.divan.com
Password: [secure password]
Campus: Test University

Email: pentester2@pentest.divan.com  
Password: [secure password]
Campus: Test University

Admin (staging only):
Email: admin@pentest.divan.com
Password: [secure password]
```

### Data Handling

- No real user data to be extracted
- Screenshots of vulnerabilities permitted
- Proof of concept limited to test accounts
- All findings to be encrypted in transit
- Delete test data within 30 days of engagement

## Communication

### Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Project Lead | TBD | tbd@divan.com | +1-XXX-XXX-XXXX |
| Technical POC | TBD | tbd@divan.com | +1-XXX-XXX-XXXX |
| Security Lead | TBD | security@divan.com | +1-XXX-XXX-XXXX |
| Emergency | - | emergency@divan.com | +1-XXX-XXX-XXXX |

### Communication Channels

| Channel | Purpose |
|---------|---------|
| Email (encrypted) | Findings, reports |
| Slack channel | Daily updates |
| Phone | Emergency only |

### Reporting Schedule

| Milestone | Timing |
|-----------|--------|
| Kickoff call | Day 1 |
| Daily standup | Daily 10 AM EST |
| Critical finding | Within 4 hours |
| High finding | Within 24 hours |
| Weekly summary | End of week |
| Draft report | Week 3 |
| Final report | Week 4 |

## Emergency Procedures

### Emergency Abort

If testing causes unintended impact:

1. **Stop all testing immediately**
2. Contact emergency phone number
3. Document actions taken
4. Preserve logs

### Critical Finding Protocol

If a critical vulnerability is discovered:

1. Stop exploiting immediately
2. Document finding with minimal proof of concept
3. Contact security lead within 4 hours
4. Do not disclose to anyone else
5. Allow 72 hours for initial remediation

### Incident During Testing

If a real security incident is detected during testing:

1. Pause all testing
2. Notify security lead immediately
3. Provide any relevant logs
4. Resume only after clearance

## Deliverables

### Expected from Pentest Firm

| Deliverable | Format | Timeline |
|-------------|--------|----------|
| Executive Summary | PDF | Final report |
| Technical Report | PDF | Final report |
| Vulnerability Details | CSV/JSON | With report |
| Proof of Concept | Video/Screenshots | With report |
| Remediation Guidance | PDF | With report |
| Retest Results | PDF | After remediation |

### Vulnerability Classification

Use CVSS v3.1 for severity:

| CVSS Score | Severity | SLA |
|------------|----------|-----|
| 9.0 - 10.0 | Critical | 24 hours |
| 7.0 - 8.9 | High | 7 days |
| 4.0 - 6.9 | Medium | 30 days |
| 0.1 - 3.9 | Low | 90 days |

## Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| **Preparation** | 1 week | Scope finalization, access setup |
| **Reconnaissance** | 2-3 days | Information gathering |
| **Testing** | 2 weeks | Active testing |
| **Reporting** | 3-5 days | Report writing |
| **Review** | 2-3 days | Report review, questions |
| **Remediation** | 2-4 weeks | Fix vulnerabilities |
| **Retest** | 3-5 days | Verify fixes |

## Budget Considerations

| Service | Estimated Cost |
|---------|---------------|
| Web app pentest (2 weeks) | $15,000 - $30,000 |
| API pentest | Included |
| Retest | $3,000 - $5,000 |
| Total | $18,000 - $35,000 |

## Action Items

1. [ ] Finalize scope with security team
2. [ ] Create test accounts in staging
3. [ ] Set up secure communication channel
4. [ ] Brief engineering team
5. [ ] Schedule kickoff meeting
6. [ ] Prepare staging environment
7. [ ] Document current known issues
