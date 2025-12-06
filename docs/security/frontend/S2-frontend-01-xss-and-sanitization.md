# S2-frontend-01: XSS Prevention & Sanitization

> **Severity**: S2 (High)  
> **Domain**: Frontend  
> **Status**: Specification

## Overview

Cross-Site Scripting (XSS) prevention strategies and content sanitization.

## Requirements

### 1. React Default Protection

React automatically escapes content in JSX:

```tsx
// ✅ SAFE: React escapes this automatically
const userInput = "<script>alert('xss')</script>";
return <div>{userInput}</div>;
// Renders as text, not executed
```

### 2. Dangerous Patterns to Avoid

```tsx
// ❌ DANGEROUS: Never use with user content
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ❌ DANGEROUS: Dynamic href with user input
<a href={userProvidedUrl}>Click</a>  // Could be javascript:

// ❌ DANGEROUS: eval or Function constructor
eval(userInput);
new Function(userInput)();
```

### 3. Safe URL Handling

```typescript
// ✅ SAFE: Validate URL scheme
function isSafeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ["http:", "https:", "mailto:"].includes(parsed.protocol);
    } catch {
        return false;
    }
}

// Usage
{isSafeUrl(profile.website) && (
    <a href={profile.website} target="_blank" rel="noopener noreferrer">
        Website
    </a>
)}
```

### 4. User-Generated Content

For rich text or markdown content:

```typescript
import DOMPurify from "dompurify";

// Sanitize HTML before rendering
const sanitizedHtml = DOMPurify.sanitize(userHtml, {
    ALLOWED_TAGS: ["p", "b", "i", "em", "strong", "a", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "target", "rel"],
});

// Then safe to use dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

### 5. Event Handler Safety

```tsx
// ❌ DANGEROUS: User-controlled event handler
<button onClick={userProvidedFunction}>Click</button>

// ✅ SAFE: Controlled handler with user data
<button onClick={() => handleAction(userData)}>Click</button>
```

### 6. DOM Data Attributes

```tsx
// ❌ AVOID: Sensitive data in DOM attributes
<div data-user-id={user.id} data-session-token={token}>

// ✅ BETTER: Use React state, not DOM
const [userId] = useState(user.id);
```

### 7. Third-Party Content

- Iframe sandboxing for external content
- Content Security Policy (CSP) headers
- Subresource Integrity (SRI) for CDN scripts

```html
<!-- Sandboxed iframe -->
<iframe 
    src={externalUrl}
    sandbox="allow-scripts allow-same-origin"
    referrerPolicy="no-referrer"
/>
```

### 8. Content Security Policy

Recommended CSP header:

```
Content-Security-Policy: 
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://cdn.example.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    connect-src 'self' https://api.divan.com wss://api.divan.com;
    frame-ancestors 'none';
```

## Implementation Checklist

- [ ] Audit all `dangerouslySetInnerHTML` usage
- [ ] URL validation helper function
- [ ] DOMPurify for rich text rendering
- [ ] Remove sensitive data from DOM attributes
- [ ] CSP header configuration
- [ ] Security linting rules (eslint-plugin-security)

## Testing

- [ ] XSS payload testing in all input fields
- [ ] JavaScript URL injection testing
- [ ] CSP violation monitoring

## Related Specs

- [S2-backend-01-validation-guardrails.md](../backend/S2-backend-01-validation-guardrails.md)
- [S1-frontend-01-auth-storage.md](./S1-frontend-01-auth-storage.md)
