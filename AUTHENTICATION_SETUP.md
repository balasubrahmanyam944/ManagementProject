# UPMY Authentication System Setup

## Overview
This implementation provides a complete SaaS-ready authentication system with NextAuth.js, featuring multiple authentication providers, role-based access control, subscription management, and enterprise-grade security.

## Features Implemented

### 🔐 Authentication Providers
- **Google OAuth** - Social login with Google accounts
- **GitHub OAuth** - Social login with GitHub accounts  
- **Email Magic Links** - Passwordless authentication via email
- **Credentials** - Traditional email/password authentication

### 👥 User Management
- **Role-based Access Control** (USER, ADMIN, PREMIUM)
- **Subscription Management** (FREE, PRO, ENTERPRISE)
- **User Profile Management**
- **Account Security** with login attempt tracking

### 🔒 Security Features
- **Brute Force Protection** with account lockout
- **Session Management** with JWT tokens
- **Audit Logging** for all user actions
- **Security Event Monitoring**
- **Rate Limiting** for API endpoints

### 📊 Database Schema
- **Users** with roles and subscriptions
- **Integrations** for Jira/Trello per user
- **Projects** with user ownership
- **Audit Logs** for compliance
- **Sessions** and **Accounts** for NextAuth

## Environment Variables Required

Create a `.env.local` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/upmy_db"

# NextAuth.js Configuration
NEXTAUTH_URL="http://localhost:9003"
NEXTAUTH_SECRET="your-super-secret-key-here-minimum-32-characters"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id" 
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Email Configuration (for magic links)
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASSWORD="your-app-password"
EMAIL_FROM="noreply@upmy.app"
```

## Setup Instructions

### 1. Database Setup
```bash
# Initialize Prisma
npx prisma generate
npx prisma db push

# Or run migrations
npx prisma migrate dev --name init
```

### 2. OAuth Provider Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Set authorized redirect URI: `http://localhost:9003/api/auth/callback/google`
6. Copy Client ID and Secret to `.env.local`

#### GitHub OAuth
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:9003/api/auth/callback/github`
4. Copy Client ID and Secret to `.env.local`

### 3. Email Configuration
For Gmail SMTP:
1. Enable 2-factor authentication
2. Generate an app-specific password
3. Use your Gmail and app password in environment variables

### 4. Start the Application
```bash
npm run dev
```

## File Structure Created

```
src/
├── app/
│   ├── api/auth/[...nextauth]/route.ts    # NextAuth API routes
│   ├── auth/signin/page.tsx               # Beautiful sign-in page
│   └── dashboard/page.tsx                 # Protected dashboard
├── components/providers/
│   └── auth-provider.tsx                  # Session provider wrapper
├── hooks/
│   └── use-auth.ts                        # Custom auth hooks
├── lib/
│   ├── auth/
│   │   ├── config.ts                      # NextAuth configuration
│   │   └── user-service.ts                # User management service
│   └── db/
│       └── prisma.ts                      # Database client
├── middleware.ts                          # Route protection
├── types/
│   └── next-auth.d.ts                     # TypeScript declarations
└── prisma/
    └── schema.prisma                      # Database schema
```

## Usage Examples

### Using Authentication Hooks
```tsx
'use client'
import { useAuth } from '@/hooks/use-auth'

export function MyComponent() {
  const { user, isAuthenticated, logout, hasRole } = useAuth()
  
  if (!isAuthenticated) {
    return <div>Please sign in</div>
  }
  
  return (
    <div>
      <h1>Welcome {user.name}!</h1>
      {hasRole('ADMIN') && <AdminPanel />}
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  )
}
```

### Protecting Routes with Middleware
Routes are automatically protected based on the middleware configuration:
- `/dashboard/*` - Requires authentication
- `/admin/*` - Requires ADMIN role
- `/premium/*` - Requires PREMIUM or ADMIN role

### Using User Service
```tsx
import { userService } from '@/lib/auth/user-service'

// Create user
const user = await userService.createUser({
  email: 'user@example.com',
  name: 'John Doe',
  password: 'securepassword'
})

// Update subscription
await userService.updateSubscription(userId, {
  type: 'PRO',
  status: 'ACTIVE'
})
```

## Integration with Existing Architecture

The authentication system integrates seamlessly with your existing:
- **Security Manager** - For brute force protection and threat detection
- **Performance Cache** - For session and user data caching
- **Monitoring System** - For authentication event tracking
- **Error Handling** - For proper error reporting

## Security Considerations

1. **Password Security**: Passwords are hashed with bcrypt (12 rounds)
2. **Session Security**: JWT tokens with 30-day expiration
3. **CSRF Protection**: Built into NextAuth.js
4. **Rate Limiting**: Integrated with existing rate limiter
5. **Audit Logging**: All authentication events are logged
6. **Account Lockout**: Configurable failed login protection

## Production Deployment

1. Set `NEXTAUTH_URL` to your production domain
2. Use a strong `NEXTAUTH_SECRET` (minimum 32 characters)
3. Configure production database URL
4. Set up production email service
5. Update OAuth redirect URIs for production domain
6. Enable database connection pooling for scalability

## Next Steps

1. **Database Migration**: Run Prisma migrations in production
2. **Email Templates**: Customize email templates for magic links
3. **User Registration**: Add user registration flow
4. **Password Reset**: Implement password reset functionality
5. **Social Profile Sync**: Sync additional data from OAuth providers
6. **Admin Dashboard**: Create admin interface for user management

## Testing

The authentication system includes:
- **Unit Tests**: For user service methods
- **Integration Tests**: For auth flow testing
- **Security Tests**: For protection mechanisms
- **Load Tests**: For performance under load

All tests use the existing testing infrastructure in `src/lib/testing/`.

## Support

For issues or questions:
1. Check the NextAuth.js documentation
2. Review the security manager configuration
3. Check database connection and schema
4. Verify environment variables are set correctly 