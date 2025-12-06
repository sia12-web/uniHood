# S2-backend-01: Input Validation & Guardrails

> **Severity**: S2 (High)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

Input validation rules and guardrails to prevent injection attacks and data corruption.

## Requirements

### 1. Request Validation

- **All inputs must be validated** before processing
- Use Pydantic models for automatic validation
- Reject requests with unexpected fields (`extra = "forbid"`)
- Enforce type coercion with strict mode where needed

### 2. String Validation

| Field Type | Max Length | Pattern | Sanitization |
|------------|------------|---------|--------------|
| Handle/Username | 30 | `^[a-z0-9_]+$` | Lowercase |
| Display Name | 80 | Unicode allowed | Strip whitespace |
| Email | 254 | RFC 5322 | Lowercase |
| Bio | 500 | Unicode allowed | Strip control chars |
| URL | 2048 | Valid URL schema | Allowlist schemes |

### 3. Numeric Validation

- Define min/max bounds for all numeric inputs
- Reject NaN, Infinity values
- Use appropriate precision for decimals

### 4. File Upload Validation

- **Content-Type verification** (not just extension)
- **Magic byte validation** for images
- **Size limits**: 10MB images, 50MB documents
- **Filename sanitization**: Remove path traversal chars
- **Virus scanning** for uploaded files (production)

### 5. SQL Injection Prevention

- **Always use parameterized queries**
- Never concatenate user input into SQL
- Use ORM/query builder abstractions

```python
# ❌ BAD: String concatenation
query = f"SELECT * FROM users WHERE id = '{user_id}'"

# ✅ GOOD: Parameterized query
query = "SELECT * FROM users WHERE id = $1"
await conn.fetch(query, user_id)
```

### 6. Path Traversal Prevention

- Validate file paths against allowlist
- Reject paths containing `..`, `~`, or absolute paths
- Use `pathlib` for safe path manipulation

## Implementation Checklist

- [ ] Pydantic models for all endpoints
- [ ] Custom validators for handles, emails
- [ ] File upload middleware with validation
- [ ] SQL query audit (no string concatenation)
- [ ] Path traversal tests

## Related Specs

- [S2-backend-02-authorization-rules.md](./S2-backend-02-authorization-rules.md)
- [S2-frontend-01-xss-and-sanitization.md](../frontend/S2-frontend-01-xss-and-sanitization.md)
