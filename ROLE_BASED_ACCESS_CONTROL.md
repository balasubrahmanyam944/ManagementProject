# Role-Based Access Control (RBAC) System

## 🎯 **Overview**

The UPMY application now includes a comprehensive Role-Based Access Control (RBAC) system that controls what pages and features users can access based on their assigned roles.

## 👥 **Available Roles**

| Role | Description | Access Level |
|------|-------------|--------------|
| **USER** | Standard user | Basic access to most features |
| **ADMIN** | Administrator | Full access to all features including admin panel |
| **PREMIUM** | Premium subscriber | Enhanced features and analytics |
| **MANAGER** | Project Manager | Full access to all pages and features |
| **DEVELOPER** | Software Developer | All pages except Project Overview |
| **TESTER** | Quality Assurance Tester | All pages except Project Overview |

## 🔐 **Access Control Matrix**

| Page/Feature | USER | ADMIN | PREMIUM | MANAGER | DEVELOPER | TESTER |
|--------------|------|-------|---------|---------|-----------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Project Overview** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Velocity Graphs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sentiment Analysis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Integrations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin Panel | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Premium Features | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

## 🧪 **Test Credentials**

Use these credentials to test different role access levels:

```
Manager:    manager@example.com    / password123
Developer:  developer@example.com  / password123  
Tester:     tester@example.com     / password123
User:       test@example.com       / password123
```

## 🛠 **Implementation Details**

### **1. Database Schema**
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

### **2. Key Files Modified**

#### **Authentication & Types**
- `prisma/schema.prisma` - Added new roles to UserRole enum
- `src/types/next-auth.d.ts` - Updated TypeScript types
- `src/lib/auth/config.ts` - Updated auth configuration
- `src/hooks/use-auth.ts` - Added role-based helper functions

#### **Access Control**
- `src/middleware.ts` - Route-level access control
- `src/components/layout/sidebar-nav.tsx` - Navigation filtering

### **3. Access Control Logic**

#### **Middleware Protection**
```typescript
// Project Overview access control: DEVELOPER and TESTER cannot access
if (isProjectOverview && ['DEVELOPER', 'TESTER'].includes(token?.role as string)) {
  return NextResponse.redirect(new URL('/dashboard?error=access-denied', req.url))
}
```

#### **Navigation Filtering**
```typescript
const navItems = [
  { href: "/project-overview", label: "Project Overview", roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER'] },
  // DEVELOPER and TESTER excluded from Project Overview
];
```

### **4. Helper Functions**

The `useAuth` hook provides convenient role-checking functions:

```typescript
const { 
  isManager, 
  isDeveloper, 
  isTester,
  canAccessProjectOverview,
  canAccessAllPages,
  hasRole 
} = useAuth();

// Usage examples
if (canAccessProjectOverview) {
  // Show Project Overview content
}

if (hasRole(['ADMIN', 'MANAGER'])) {
  // Show admin/manager specific features
}
```

## 📋 **Adding New Roles**

To add new roles to the system:

### **Step 1: Update Database Schema**
```prisma
// prisma/schema.prisma
enum UserRole {
  USER
  ADMIN
  PREMIUM
  MANAGER
  DEVELOPER
  TESTER
  NEW_ROLE  // ← Add here
}
```

### **Step 2: Update TypeScript Types**
```typescript
// src/types/next-auth.d.ts
role: 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER' | 'NEW_ROLE'

// src/hooks/use-auth.ts
export type UserRole = 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER' | 'NEW_ROLE'

// src/lib/auth/config.ts
type UserRole = 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER' | 'NEW_ROLE'
```

### **Step 3: Update Navigation**
```typescript
// src/components/layout/sidebar-nav.tsx
const navItems = [
  { 
    href: "/some-page", 
    label: "Some Page", 
    roles: ['USER', 'ADMIN', 'NEW_ROLE'] // ← Add role here
  },
];
```

### **Step 4: Update Middleware (if needed)**
```typescript
// src/middleware.ts
if (isSpecialPage && !['ADMIN', 'NEW_ROLE'].includes(token?.role as string)) {
  return NextResponse.redirect(new URL('/dashboard?error=unauthorized', req.url))
}
```

### **Step 5: Run Database Migration**
```bash
npx prisma db push
npx prisma generate
```

## 🔄 **Role Assignment**

### **Manual Assignment**
Update user roles directly in the database or through Prisma Studio:

```bash
npx prisma studio
```

### **Programmatic Assignment**
```typescript
await prisma.user.update({
  where: { email: 'user@example.com' },
  data: { role: 'MANAGER' }
});
```

## 🚨 **Security Considerations**

1. **Server-Side Validation**: All access control is enforced server-side through middleware
2. **JWT Token Security**: Role information is stored in secure JWT tokens
3. **Route Protection**: Protected routes redirect unauthorized users
4. **Navigation Hiding**: UI elements are hidden based on roles (defense in depth)

## 🧪 **Testing Role Access**

1. **Login with different role credentials**
2. **Verify navigation menu shows/hides appropriate items**
3. **Try accessing restricted URLs directly**
4. **Confirm proper redirects for unauthorized access**

### **Test Scenarios**

| Test Case | Expected Behavior |
|-----------|-------------------|
| DEVELOPER tries to access `/project-overview` | Redirected to dashboard with error |
| TESTER tries to access `/project-overview` | Redirected to dashboard with error |
| MANAGER accesses `/project-overview` | Full access granted |
| Navigation menu for DEVELOPER | Project Overview link hidden |
| Navigation menu for MANAGER | All links visible |

## 📊 **Role Usage Analytics**

Monitor role usage through the audit logs:

```sql
SELECT 
  u.role,
  COUNT(*) as login_count,
  MAX(al.createdAt) as last_login
FROM users u
LEFT JOIN audit_logs al ON u.id = al.userId 
WHERE al.action = 'LOGIN'
GROUP BY u.role;
```

## 🔧 **Troubleshooting**

### **Common Issues**

1. **Role not updating after change**
   - Clear browser cache and cookies
   - Re-login to refresh JWT token

2. **Navigation not updating**
   - Check if user object is properly loaded
   - Verify role filtering logic in sidebar-nav.tsx

3. **Access denied errors**
   - Check middleware.ts for route protection rules
   - Verify role spelling and case sensitivity

### **Debug Commands**

```bash
# Check current users and roles
npx prisma studio

# View application logs
npm run dev

# Test authentication
curl -X POST http://localhost:9003/api/auth/signin
```

---

## 📝 **Summary**

The RBAC system provides:
- ✅ **Granular Access Control** - Page-level permissions
- ✅ **Role-Based Navigation** - Dynamic menu filtering  
- ✅ **Security Enforcement** - Server-side validation
- ✅ **Easy Extension** - Simple role addition process
- ✅ **Test Coverage** - Multiple test accounts
- ✅ **Audit Trail** - Login and access logging

The system successfully restricts **DEVELOPER** and **TESTER** roles from accessing the **Project Overview** page while allowing **MANAGER** full access to all features. 