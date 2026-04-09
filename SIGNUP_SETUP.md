# UPMY Sign-Up System Setup

## Overview
This implementation provides a complete sign-up system with role-based access control, featuring user registration with role selection (Manager, Tester, Developer) and MongoDB integration.

## Features Implemented

### 🔐 User Registration
- **Role Selection**: Users can choose between Manager, Tester, and Developer roles
- **Form Validation**: Comprehensive client-side and server-side validation
- **Password Security**: Strong password requirements with confirmation
- **Email Validation**: Proper email format validation
- **Name Validation**: Required full name with minimum length

### 👥 Role-Based Access Control
- **Manager Role**: Access to team management, project analytics, and resource allocation
- **Tester Role**: Access to test case management, testing analytics, and defect tracking
- **Developer Role**: Access to development tracking, task management, and code integration

### 🎨 User Interface
- **Modern Design**: Beautiful, responsive sign-up page matching the existing design system
- **Role Descriptions**: Clear descriptions for each role to help users choose
- **Success Feedback**: Confirmation page with automatic redirect to sign-in
- **Error Handling**: Comprehensive error messages and validation feedback

### 🔒 Security Features
- **Password Hashing**: Secure password storage using bcrypt
- **Audit Logging**: All registration events are logged for compliance
- **Input Sanitization**: Proper validation and sanitization of user inputs
- **Rate Limiting**: Protection against brute force attacks

## File Structure Created

```
src/
├── app/
│   ├── auth/
│   │   ├── register/
│   │   │   └── page.tsx              # New sign-up page
│   │   └── signin/
│   │       └── page.tsx              # Updated with register link
│   └── api/auth/
│       └── register/
│           └── route.ts              # Updated registration API
├── lib/auth/
│   ├── config.ts                     # Updated with new roles
│   └── user-service.ts               # Updated with new roles
├── types/
│   └── next-auth.d.ts                # Updated with new roles
└── middleware.ts                     # Updated with register route
```

## Environment Setup

Create a `.env.local` file with the following variables:

```env
# Database
DATABASE_URL="mongodb://localhost:27018/upmy_db?replicaSet=rs0"

# NextAuth.js Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-here-minimum-32-characters-change-this-in-production"

# Environment
NODE_ENV="development"
```

## Database Schema

The system uses the existing Prisma schema with the following UserRole enum:

```prisma
enum UserRole {
  USER
  ADMIN
  PREMIUM
  MANAGER
  DEVELOPER
  TESTER
}
```

## Setup Instructions

### 1. Environment Configuration
```bash
# Copy the example environment file
cp env.example .env.local

# Edit .env.local with your MongoDB connection string
# Make sure to change the NEXTAUTH_SECRET to a secure value
```

### 2. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (for development)
npx prisma db push

# Or run migrations (for production)
npx prisma migrate dev --name init
```

### 3. Start the Application
```bash
npm run dev
```

## Usage

### User Registration Flow
1. User visits `/auth/register`
2. Fills out the registration form with:
   - Full Name
   - Email Address
   - Password (with confirmation)
   - Role Selection (Manager/Tester/Developer)
3. Form validates input and submits to `/api/auth/register`
4. User is created in MongoDB with hashed password
5. User is automatically signed in with their new credentials
6. User is redirected to the dashboard with their role-specific content
7. If auto sign-in fails, user is redirected to sign-in page with success message

### Role-Based Dashboard
After signing in, users see different dashboard content based on their role:

- **Manager**: Team management, analytics, and project oversight features
- **Tester**: Test case management and testing analytics features
- **Developer**: Development tracking and task management features

## API Endpoints

### POST /api/auth/register
Creates a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123",
  "role": "MANAGER"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "user_id",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "MANAGER"
  }
}
```

## Security Considerations

1. **Password Requirements**: Minimum 8 characters with uppercase, lowercase, and number
2. **Email Validation**: Proper email format validation
3. **Role Validation**: Only allowed roles (MANAGER, TESTER, DEVELOPER) are accepted
4. **Audit Logging**: All registration events are logged with IP and user agent
5. **Input Sanitization**: All inputs are validated and sanitized
6. **Rate Limiting**: Protection against registration spam

## Testing

To test the sign-up functionality:

1. Start the application: `npm run dev`
2. Navigate to `http://localhost:3000/auth/register`
3. Fill out the registration form with different roles
4. Verify that users are created in MongoDB
5. Test sign-in with the created accounts
6. Verify role-based dashboard content

## Production Deployment

1. Set `NEXTAUTH_URL` to your production domain
2. Use a strong `NEXTAUTH_SECRET` (minimum 32 characters)
3. Configure production MongoDB URL
4. Enable database connection pooling for scalability
5. Set up proper logging and monitoring
6. Configure rate limiting for production

## Next Steps

1. **Email Verification**: Add email verification for new accounts
2. **Password Reset**: Implement password reset functionality
3. **Profile Management**: Add user profile editing capabilities
4. **Role Management**: Allow admins to change user roles
5. **Advanced Analytics**: Add role-specific analytics and reporting
6. **Team Management**: Implement team creation and management for managers 