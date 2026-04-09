# Tenant-Specific Email Verification

## Overview

Email verification is **ONLY required for tenants**, not for the parent application (port 9003). This ensures that:

- **Tenants**: Must verify email before logging in
- **Parent App**: No email verification required, users can login immediately

## How It Works

### Tenant Detection

The system detects if it's running as a tenant by checking the `NEXT_PUBLIC_TENANT_BASEPATH` environment variable:

```typescript
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
const isTenant = !!basePath
```

- **Tenant**: `NEXT_PUBLIC_TENANT_BASEPATH` is set (e.g., `/suntechnologies`)
- **Parent App**: `NEXT_PUBLIC_TENANT_BASEPATH` is empty or undefined

### Signup Flow

#### For Tenants:
1. User signs up
2. System generates verification token
3. User is created with `isVerified: false`
4. Verification email is sent via Zapier webhook
5. User must verify email before logging in

#### For Parent App:
1. User signs up
2. User is created with `isVerified: true` (auto-verified)
3. No verification email sent
4. User can login immediately

### Login Flow

#### For Tenants:
- **Verified users**: Can login and access dashboard
- **Unverified users**: Login is blocked with error: "Please verify your email before logging in. Check your inbox for the verification link."

#### For Parent App:
- All users can login regardless of verification status
- No verification check is performed

### Middleware Protection

The middleware only blocks unverified users for tenants:

```typescript
// Only enforce verification for tenants, not for parent app
if (isTenant && isAuth && token && !isVerifyPage && !isVerifyApi && !isAuthPage) {
  const isVerified = (token as any)?.isVerified
  
  if (!isPublicPage && pathname !== withBase('/') && !pathname.startsWith(withBase('/shared'))) {
    if (!isVerified) {
      return NextResponse.redirect(new URL(withBase('/auth/verify-email'), req.url))
    }
  }
}
```

## Code Changes

### 1. Signup Route (`src/app/api/auth/register/route.ts`)

```typescript
// Check if this is a tenant (has basePath) or parent app
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
const isTenant = !!basePath

// For tenants: require email verification
// For parent app: no verification required
let verifyToken: string | undefined
let verifyTokenExpires: Date | undefined
let isVerified = !isTenant // Parent app users are auto-verified, tenants are not

if (isTenant) {
  // Generate verification token for tenants only
  verifyToken = generateVerificationToken()
  verifyTokenExpires = generateTokenExpiration()
}

// Create user with appropriate verification status
const user = await userService.createUser({...})

// Update user with verification status and token (if tenant)
const updateData: any = { isVerified }
if (isTenant && verifyToken && verifyTokenExpires) {
  updateData.verifyToken = verifyToken
  updateData.verifyTokenExpires = verifyTokenExpires
}

// Send verification email (only for tenants)
if (isTenant && verifyToken) {
  // Send to Zapier webhook
}
```

### 2. Auth Config (`src/lib/auth/config.ts`)

```typescript
// Check email verification (only for tenants)
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
const isTenant = !!basePath

if (isTenant && !user.isVerified) {
  // For tenants: block login if not verified
  throw new Error('Please verify your email before logging in. Check your inbox for the verification link.')
}
```

### 3. Middleware (`src/middleware.ts`)

```typescript
// Block unverified users from accessing protected routes (only for tenants)
const isTenant = !!basePath

// Only enforce verification for tenants, not for parent app
if (isTenant && isAuth && token && !isVerifyPage && !isVerifyApi && !isAuthPage) {
  const isVerified = (token as any)?.isVerified
  
  if (!isPublicPage && pathname !== withBase('/') && !pathname.startsWith(withBase('/shared'))) {
    if (!isVerified) {
      return NextResponse.redirect(new URL(withBase('/auth/verify-email'), req.url))
    }
  }
}
```

### 4. Verification Endpoint (`src/app/api/auth/verify/route.ts`)

The resend endpoint checks if it's a tenant:

```typescript
// Check if this is a tenant (verification only works for tenants)
const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
const isTenant = !!basePath

if (!isTenant) {
  return NextResponse.json(
    { error: 'Email verification is only available for tenant accounts.' },
    { status: 403 }
  )
}
```

## Testing

### Test Tenant Signup:
1. Set `NEXT_PUBLIC_TENANT_BASEPATH=/suntechnologies`
2. Sign up a new user
3. Check that `isVerified: false` in database
4. Check that verification email is sent
5. Try to login - should be blocked with verification error
6. Click verification link
7. Try to login - should succeed

### Test Parent App Signup:
1. Ensure `NEXT_PUBLIC_TENANT_BASEPATH` is empty/undefined
2. Sign up a new user
3. Check that `isVerified: true` in database
4. Check that NO verification email is sent
5. Try to login - should succeed immediately

## Summary

| Feature | Tenant | Parent App |
|---------|--------|------------|
| Email Verification Required | ✅ Yes | ❌ No |
| Verification Email Sent | ✅ Yes | ❌ No |
| Login Blocked if Unverified | ✅ Yes | ❌ No |
| Auto-Verified on Signup | ❌ No | ✅ Yes |
| Resend Verification | ✅ Yes | ❌ N/A |

This ensures that tenants have proper email verification while the parent application remains accessible without verification requirements.

