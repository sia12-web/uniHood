---
description: Perform a comprehensive security audit (Secrets, SQL Injection, Dependencies)
---
# Security Audit Workflow

This workflow outlines the steps to perform a routine security audit of the uniHood platform. Run this at least monthly or before major releases.

## 1. Dependency Vulnerability Check
Scan Python and Node.js dependencies for known CVEs.

```bash
# Backend (Python)
cd backend
pip install safety
safety check

# Frontend (Node.js)
cd frontend
npm audit
```

## 2. Configuration Review
Verify production security settings.

1.  **HSTS & HTTPS**: Ensure `STRICT_TRANSPORT_SECURITY` header is present in responses.
2.  **Cookies**: Verify `HttpOnly` and `Secure` flags are set on session cookies.
3.  **Debug Mode**: Ensure `DEBUG=False` (or `ENVIRONMENT=production`) in live env.

## 3. Access Control Audit
Review administrative access and role integrity.

1.  **MFA Status**: Run the following SQL to find admins without 2FA (Severity: CRITICAL):
    ```sql
    SELECT u.email, u.handle 
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = 'admin'
    AND NOT EXISTS (SELECT 1 FROM twofa t WHERE t.user_id = u.id AND t.enabled = true);
    ```
2.  **Audit Log Health**: Verify `audit_logs` are capturing events:
    ```sql
    SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours';
    ```
3.  **Token Version Integrity**: valid users should represent the majority version:
    ```sql
    SELECT token_version, COUNT(*) FROM users GROUP BY token_version;
    ```
4.  **Role Review**: Revoke `admin` role from users who no longer need it.

## 4. Secret Scanning
Check codebase for accidentally committed secrets.

```bash
# Requires 'detect-secrets' or similar tool
detect-secrets scan
```

## 5. Database & Infrastructure
1.  **SSL**: Confirm application connects with `ssl_mode=require`.
2.  **Backups**: Verify latest automated backup completed successfully.
3.  **Rate Limits**: Check Redis key expiration times to ensure strict limits are active.
    ```bash
    redis-cli keys "rl:2fa_verify:*"
    ```

## 6. Report
Document findings in a new Security Audit Issue and assign remediation tasks.
