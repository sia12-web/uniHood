# S6-02: Bug Bounty Program Onboarding

> Status: 📋 **Planning** — Start with private program

## Goals

- Establish a structured vulnerability disclosure program
- Define severity tiers and payouts
- Create intake and triage process

## Program Strategy

### Phase 1: Private Program (Recommended Start)

| Aspect | Details |
|--------|---------|
| Platform | HackerOne or Bugcrowd |
| Researchers | 10-20 invited, vetted researchers |
| Duration | 3-6 months |
| Goal | Test waters, refine process |

### Phase 2: Public Program

| Aspect | Details |
|--------|---------|
| Platform | Same as Phase 1 |
| Researchers | Open to all |
| Timing | After private program maturity |

## Scope Definition

### In Scope

| Target | Description |
|--------|-------------|
| `*.divan.com` | All subdomains |
| iOS/Android apps | When released |
| API (`api.divan.com`) | All documented endpoints |

### Out of Scope

| Target | Reason |
|--------|--------|
| Third-party services | Not our code |
| DoS/DDoS | Disruptive |
| Social engineering | Separate program |
| Physical security | N/A |
| Spam/rate limiting | Low value |

### Qualifying Vulnerabilities

| Category | In Scope |
|----------|----------|
| Authentication bypass | ✅ |
| IDOR / Authorization | ✅ |
| SQL Injection | ✅ |
| XSS (Stored, Reflected) | ✅ |
| CSRF | ✅ |
| SSRF | ✅ |
| RCE | ✅ |
| Information disclosure | ✅ (PII, secrets) |
| Broken access control | ✅ |
| Insecure deserialization | ✅ |
| Security misconfig | ✅ |

### Non-Qualifying Issues

| Issue | Reason |
|-------|--------|
| Missing security headers (non-exploitable) | Low impact |
| SSL/TLS configuration (unless exploitable) | Informational |
| Clickjacking (non-sensitive pages) | Low impact |
| Self-XSS | Requires victim action |
| CSRF on logout | Low impact |
| Rate limiting bypass (unless auth) | Abuse, not security |
| User enumeration (unless combined) | Design choice |
| Outdated software (without exploit) | Informational |

## Severity & Payouts

### CVSS-Based Tiers

| Severity | CVSS | Payout Range | Examples |
|----------|------|--------------|----------|
| **Critical** | 9.0-10.0 | $2,000-$5,000 | RCE, auth bypass, mass data breach |
| **High** | 7.0-8.9 | $750-$2,000 | SQLi, stored XSS, privilege escalation |
| **Medium** | 4.0-6.9 | $200-$750 | CSRF, reflected XSS, IDOR (limited) |
| **Low** | 0.1-3.9 | $50-$200 | Information disclosure, minor misconfig |

### Bonus Multipliers

| Condition | Multiplier |
|-----------|------------|
| First report of type | 1.25x |
| Exceptional write-up | 1.1x |
| Includes fix suggestion | 1.1x |
| Discovered in production | 1.0x (base) |
| Discovered in staging only | 0.75x |

### Annual Budget

| Phase | Estimated Annual |
|-------|------------------|
| Private (10-20 researchers) | $15,000-$25,000 |
| Public | $50,000-$100,000 |

## Disclosure Policy

### Coordinated Disclosure

```markdown
## Disclosure Timeline

1. **Day 0**: Report received, acknowledged within 24 hours
2. **Day 1-3**: Initial triage, severity assessment
3. **Day 7**: Status update to researcher
4. **Day 30**: Target remediation for Critical/High
5. **Day 90**: Target remediation for Medium/Low
6. **Day 90+**: Public disclosure (coordinated)

## Disclosure Rules

- No public disclosure before fix is deployed
- Researcher may publish write-up after:
  - Fix is confirmed deployed
  - 90 days from report (whichever is first)
  - Coordination with Divan security team
- Divan may request 30-day extension for complex issues
```

## Intake & Triage Process

### Submission Requirements

Researchers must provide:
```markdown
1. **Summary**: One-paragraph description
2. **Severity**: Self-assessed CVSS score
3. **Steps to Reproduce**: Detailed, numbered steps
4. **Proof of Concept**: Screenshots, video, or code
5. **Impact**: What an attacker could achieve
6. **Affected Systems**: URLs, endpoints
7. **Recommendations**: (Optional) How to fix
```

### Triage Workflow

```
┌─────────────┐
│   Report    │
│  Received   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Initial   │────▶│   Invalid/   │
│   Triage    │     │   Duplicate  │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐
│  Reproduce  │
│    Issue    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Assign    │────▶│  Engineering │
│  Severity   │     │    Ticket    │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐
│    Fix &    │
│   Deploy    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Verify    │
│    Fix      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Reward    │
│  Researcher │
└─────────────┘
```

### SLA Targets

| Activity | SLA |
|----------|-----|
| Initial acknowledgment | < 24 hours |
| Triage completion | < 3 business days |
| Severity confirmation | < 5 business days |
| Status update (if fix delayed) | Weekly |
| Critical fix deployed | < 72 hours |
| High fix deployed | < 7 days |
| Medium fix deployed | < 30 days |
| Reward payment | < 14 days after fix verified |

## Program Rules

### Researcher Guidelines

```markdown
## Safe Harbor

We will not pursue legal action against researchers who:
- Follow this policy
- Make good faith effort to avoid harm
- Do not access/modify data beyond proof of concept
- Report issues promptly
- Do not disclose publicly before coordinated timeline

## Testing Guidelines

DO:
- Create your own test accounts
- Test on staging when possible
- Minimize data access
- Report promptly

DO NOT:
- Access real user data
- Perform destructive testing
- Use automated scanners without coordination
- Test physical security
- Social engineer employees
```

### Duplicate Handling

- First valid report receives reward
- Duplicates receive acknowledgment, no reward
- If reports arrive within 24 hours, may split reward
- Duplicates may receive partial reward if additional impact shown

## Platform Setup (HackerOne)

### Program Settings

```yaml
Program Type: Private (initial)
Response Targets:
  First Response: 1 day
  Triage: 3 days
  Bounty: 14 days
  Resolution: 30 days

Scope:
  - asset: "*.divan.com"
    type: URL
    eligible_for_bounty: true
    eligible_for_submission: true
```

### Response Templates

**Acknowledgment:**
```
Thank you for your report. We have received it and our security team 
will review it within 3 business days. You will receive an update 
once triage is complete.

Report ID: {{report_id}}
```

**Needs More Info:**
```
Thank you for your report. To proceed with triage, we need additional 
information:

- [Specific questions]

Please update your report with this information.
```

**Valid - In Progress:**
```
We have validated this issue as [SEVERITY]. Our engineering team is 
working on a fix. We expect to deploy a fix within [TIMELINE].

You will be notified when the fix is deployed and eligible for reward.
```

**Resolved:**
```
This issue has been fixed and deployed. Thank you for your responsible 
disclosure.

Reward: $[AMOUNT]
Payment will be processed within 14 days.

After 30 days, you may publish a write-up about this finding. Please 
coordinate with us before publication.
```

## Action Items

1. [ ] Finalize scope and payouts with leadership
2. [ ] Create HackerOne/Bugcrowd account
3. [ ] Draft program policy
4. [ ] Set up internal triage workflow
5. [ ] Train team on response process
6. [ ] Invite initial researchers (Phase 1)
7. [ ] Monitor and iterate for 3 months
8. [ ] Evaluate transition to public program
