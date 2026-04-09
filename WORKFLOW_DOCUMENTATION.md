# UPMY Workflow Documentation

**Version:** 1.0  
**Date:** January 2025  
**Status:** Draft

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [User Registration and Authentication Workflows](#2-user-registration-and-authentication-workflows)
3. [Integration Setup Workflows](#3-integration-setup-workflows)
4. [Project Management Workflows](#4-project-management-workflows)
5. [Analytics and Reporting Workflows](#5-analytics-and-reporting-workflows)
6. [AI Feature Workflows](#6-ai-feature-workflows)
7. [Real-time Synchronization Workflows](#7-real-time-synchronization-workflows)
8. [Multi-Tenant Workflows](#8-multi-tenant-workflows)
9. [Administrative Workflows](#9-administrative-workflows)
10. [Error Handling and Recovery Workflows](#10-error-handling-and-recovery-workflows)

---

## 1. Introduction

### 1.1 Purpose
This document describes the detailed workflows and processes for the UPMY (Universal Project Management System) application. It provides step-by-step guidance for all major user journeys and system processes.

### 1.2 Scope
This document covers:
- User registration and authentication flows
- Integration setup and management
- Project synchronization and management
- Analytics and reporting processes
- AI-powered feature workflows
- Real-time update mechanisms
- Multi-tenant operations
- Administrative functions

### 1.3 Workflow Notation
- **User Actions**: Actions performed by users
- **System Actions**: Automated system processes
- **Decision Points**: Conditional logic and branching
- **External Systems**: Third-party integrations
- **Data Storage**: Database operations

---

## 2. User Registration and Authentication Workflows

### 2.1 User Registration Workflow

#### 2.1.1 Standard Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER REGISTRATION WORKFLOW                  │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /auth/register
   │
   ▼
2. User fills registration form:
   - Full Name (required, min 2 characters)
   - Email Address (required, valid format)
   - Password (required, min 8 characters, complexity)
   - Confirm Password (must match)
   - Role Selection (MANAGER, DEVELOPER, TESTER)
   │
   ▼
3. Client-side validation
   │
   ├─► Validation fails → Show errors, stay on page
   │
   └─► Validation passes
       │
       ▼
4. Submit to /api/auth/register (POST)
   │
   ▼
5. Server-side validation
   │
   ├─► Validation fails → Return 400 error
   │
   └─► Validation passes
       │
       ▼
6. Check if user exists
   │
   ├─► User exists → Return 400 "User already exists"
   │
   └─► User doesn't exist
       │
       ▼
7. Determine tenant status
   │
   ├─► Is Tenant (has basePath)
   │   │
   │   ├─► Generate verification token
   │   ├─► Set isVerified = false
   │   ├─► Store verification token with expiration
   │   └─► Send verification email
   │
   └─► Is Parent App (no basePath)
       │
       ├─► Set isVerified = true (auto-verified)
       └─► No email sent
       │
       ▼
8. Hash password (bcrypt, cost factor 12)
   │
   ▼
9. Get default allowedPages for role
   │
   ▼
10. Create user in database:
    - Email, Name, Hashed Password
    - Role, Allowed Pages
    - Verification status
    - Created timestamp
    │
    ▼
11. Create FREE subscription
    │
    ▼
12. Log audit event (REGISTER)
    │
    ▼
13. Return response
    │
    ├─► Tenant + Unverified
    │   │
    │   └─► Redirect to /auth/verify-email
    │
    └─► Parent App or Verified
        │
        └─► Auto sign-in → Redirect to dashboard
```

#### 2.1.2 Email Verification Workflow (Tenants Only)

```
┌─────────────────────────────────────────────────────────────────┐
│              EMAIL VERIFICATION WORKFLOW (TENANTS)              │
└─────────────────────────────────────────────────────────────────┘

1. User receives verification email
   │
   ▼
2. User clicks verification link
   │
   ▼
3. Link format: {origin}{basePath}/api/auth/verify?token={token}
   │
   ▼
4. System validates token:
   - Token exists in database
   - Token not expired
   - Token matches user
   │
   ├─► Invalid/Expired → Show error page
   │
   └─► Valid
       │
       ▼
5. Update user:
   - Set isVerified = true
   - Clear verification token
   - Clear token expiration
   │
   ▼
6. Log audit event (EMAIL_VERIFIED)
   │
   ▼
7. Redirect to sign-in page with success message
```

### 2.2 Authentication Workflows

#### 2.2.1 Credentials Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              CREDENTIALS AUTHENTICATION WORKFLOW                │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /auth/signin
   │
   ▼
2. User enters credentials:
   - Email
   - Password
   │
   ▼
3. Submit to NextAuth credentials provider
   │
   ▼
4. Server validates:
   - User exists
   - Password matches (bcrypt compare)
   │
   ├─► Invalid → Return error, stay on page
   │
   └─► Valid
       │
       ▼
5. Check if tenant requires verification
   │
   ├─► Tenant + Unverified → Block login, show error
   │
   └─► Verified or Parent App
       │
       ▼
6. Check account status
   │
   ├─► Account locked → Return error
   │
   └─► Account active
       │
       ▼
7. Check failed login attempts
   │
   ├─► Too many attempts → Lock account
   │
   └─► Within limits
       │
       ▼
8. Create session (JWT token)
   │
   ▼
9. Log audit event (LOGIN)
   │
   ▼
10. Redirect to dashboard or requested page
```

#### 2.2.2 OAuth Authentication Flow (Google/GitHub)

```
┌─────────────────────────────────────────────────────────────────┐
│              OAUTH AUTHENTICATION WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Sign in with Google/GitHub"
   │
   ▼
2. Redirect to OAuth provider authorization page
   │
   ▼
3. User authorizes application
   │
   ▼
4. OAuth provider redirects to callback:
   /api/auth/callback/{provider}?code={auth_code}
   │
   ▼
5. NextAuth exchanges code for tokens
   │
   ▼
6. Fetch user profile from provider
   │
   ▼
7. Check if user exists
   │
   ├─► User exists
   │   │
   │   └─► Update last login → Create session
   │
   └─► User doesn't exist
       │
       ├─► Create new user:
       │   - Email from provider
       │   - Name from provider
       │   - Image from provider
       │   - Role: USER (default)
       │   - isVerified: true (OAuth users)
       │
       └─► Create session
       │
       ▼
8. Log audit event (LOGIN_OAUTH)
   │
   ▼
9. Redirect to dashboard
```

#### 2.2.3 Magic Link Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              MAGIC LINK AUTHENTICATION WORKFLOW                 │
└─────────────────────────────────────────────────────────────────┘

1. User enters email on sign-in page
   │
   ▼
2. Click "Send magic link"
   │
   ▼
3. System generates magic link token
   │
   ▼
4. Send email with magic link
   │
   ▼
5. User clicks link in email
   │
   ▼
6. System validates token
   │
   ├─► Invalid/Expired → Show error
   │
   └─► Valid
       │
       ▼
7. Check if user exists
   │
   ├─► User exists → Create session
   │
   └─► User doesn't exist
       │
       ├─► Create new user (auto-verified)
       └─► Create session
       │
       ▼
8. Log audit event (LOGIN_MAGIC_LINK)
   │
   ▼
9. Redirect to dashboard
```

### 2.3 Session Management Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION MANAGEMENT WORKFLOW                 │
└─────────────────────────────────────────────────────────────────┘

1. User authenticated → JWT token created
   │
   ▼
2. Token stored in HTTP-only cookie
   │
   ▼
3. Each request includes token
   │
   ▼
4. Middleware validates token:
   - Token signature valid
   - Token not expired
   - User still exists
   - User account active
   │
   ├─► Invalid → Clear session, redirect to sign-in
   │
   └─► Valid
       │
       ▼
5. Attach user to request context
   │
   ▼
6. Check route permissions (RBAC)
   │
   ├─► Unauthorized → Redirect with error
   │
   └─► Authorized → Allow access
       │
       ▼
7. Session expires after 24 hours (configurable)
   │
   ▼
8. User can manually logout → Clear session
```

---

## 3. Integration Setup Workflows

### 3.1 Jira Integration Workflow

#### 3.1.1 OAuth Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              JIRA OAUTH CONNECTION WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /integrations page
   │
   ▼
2. User clicks "Connect Jira"
   │
   ▼
3. System checks if tenant (multi-tenant architecture)
   │
   ├─► Is Tenant
   │   │
   │   ├─► Generate OAuth state with tenant info:
   │   │   - tenant: "suntechnologies"
   │   │   - port: "9005"
   │   │   - userId: "user123"
   │   │
   │   └─► Encode state (Base64)
   │
   └─► Is Main App
       │
       └─► Generate OAuth state with user info only
       │
       ▼
4. Redirect to Jira OAuth authorization URL:
   https://auth.atlassian.com/authorize?
     audience=api.atlassian.com&
     client_id={CLIENT_ID}&
     scope=read:jira-work read:jira-user write:jira-work offline_access&
     redirect_uri={CENTRALIZED_CALLBACK}&
     state={ENCODED_STATE}&
     response_type=code&
     prompt=consent
   │
   ▼
5. User authorizes on Jira
   │
   ▼
6. Jira redirects to centralized callback:
   /api/oauth-router/jira/callback?code={auth_code}&state={state}
   │
   ▼
7. Main app (port 9003) receives callback
   │
   ▼
8. Parse state to extract tenant info
   │
   ├─► Tenant detected
   │   │
   │   ├─► Extract: tenant, port, userId
   │   └─► Exchange code for tokens using main app credentials
   │
   └─► Main app user
       │
       └─► Exchange code for tokens
       │
       ▼
9. Fetch Jira accessible resources (cloudId)
   │
   ▼
10. Prepare integration data:
    - accessToken
    - refreshToken
    - expiresAt
    - cloudId
    - serverUrl
    │
    ▼
11. Forward to tenant (if tenant):
    POST https://{host}:{port}/{tenant}/api/oauth-callback/jira
    Body: { integrationData }
    │
    ▼
12. Tenant stores integration:
    - Encrypt tokens
    - Store in tenant database
    - Link to user
    │
    ▼
13. Fetch and store Jira projects
    │
    ▼
14. Redirect user to /integrations?jira_connected=true
    │
    ▼
15. Show success notification
```

#### 3.1.2 Project Synchronization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│            JIRA PROJECT SYNCHRONIZATION WORKFLOW                │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to integrations page
   │
   ▼
2. System checks Jira connection status
   │
   ├─► Not connected → Show "Connect" button
   │
   └─► Connected
       │
       ▼
3. User clicks "Sync Projects"
   │
   ▼
4. System retrieves access token (with refresh if needed)
   │
   ▼
5. Call Jira API: GET /rest/api/3/project
   │
   ├─► API Error → Show error, log failure
   │
   └─► Success
       │
       ▼
6. Process projects:
   - Extract project data
   - Check if project exists in database
   │
   ├─► Project exists → Update metadata
   │
   └─► New project → Create in database
       │
       ▼
7. For each project, fetch issues:
   GET /rest/api/3/search?jql=project={projectKey}
   │
   ▼
8. Process issues:
   - Create/update issues
   - Link to project
   - Store status, assignee, dates
   │
   ▼
9. Update project analytics:
   - Total issues count
   - Status distribution
   - Assignee workload
   │
   ▼
10. Log sync event
    │
    ▼
11. Show success notification with project count
```

### 3.2 Trello Integration Workflow

#### 3.2.1 OAuth Connection Flow (OAuth 1.0a)

```
┌─────────────────────────────────────────────────────────────────┐
│            TRELLO OAUTH CONNECTION WORKFLOW (1.0a)             │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Connect Trello"
   │
   ▼
2. System generates OAuth 1.0a request token
   │
   ▼
3. Store tenant info with oauth_token as key:
   - tenant: "suntechnologies"
   - port: "9005"
   - userId: "user123"
   - requestTokenSecret: {secret}
   │
   ▼
4. Redirect to Trello authorization:
   https://trello.com/1/OAuthAuthorizeToken?
     oauth_token={request_token}&
     name=UPMY&
     expiration=never&
     scope=read,write
   │
   ▼
5. User authorizes on Trello
   │
   ▼
6. Trello redirects to centralized callback:
   /api/oauth-router/trello/callback?
     oauth_token={request_token}&
     oauth_verifier={verifier}
   │
   ▼
7. Main app receives callback
   │
   ▼
8. Retrieve tenant info using oauth_token
   │
   ▼
9. Exchange request token for access token:
   POST /1/OAuthGetAccessToken
   │
   ▼
10. Receive access token + token secret
    │
    ▼
11. Forward to tenant:
    POST https://{host}:{port}/{tenant}/api/oauth-callback/trello
    Body: {
      accessToken,
      accessTokenSecret,
      tenant,
      userId
    }
    │
    ▼
12. Tenant stores integration:
    - Encrypt tokens (both token and secret)
    - Store in tenant database
    │
    ▼
13. Fetch and store Trello boards
    │
    ▼
14. Redirect to /integrations?trello_connected=true
```

### 3.3 TestRail Integration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            TESTRAIL INTEGRATION WORKFLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /integrations
   │
   ▼
2. User clicks "Connect TestRail"
   │
   ▼
3. User enters:
   - TestRail URL (e.g., https://company.testrail.io)
   - API Token (from TestRail user settings)
   │
   ▼
4. System validates connection:
   GET /index.php?/api/v2/get_user_by_email&email={email}
   │
   ├─► Invalid credentials → Show error
   │
   └─► Valid
       │
       ▼
5. Store integration:
   - Encrypt API token
   - Store URL and token
   - Link to user
   │
   ▼
6. Fetch TestRail projects:
   GET /index.php?/api/v2/get_projects
   │
   ▼
7. Store projects in database
   │
   ▼
8. Show success notification
```

### 3.4 Slack Integration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              SLACK OAUTH CONNECTION WORKFLOW                    │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Connect Slack"
   │
   ▼
2. Generate OAuth state with tenant info
   │
   ▼
3. Redirect to Slack OAuth:
   https://slack.com/oauth/v2/authorize?
     client_id={CLIENT_ID}&
     scope=channels:read,channels:history,users:read&
     redirect_uri={CALLBACK_URL}&
     state={STATE}
   │
   ▼
4. User authorizes workspace
   │
   ▼
5. Slack redirects to callback
   │
   ▼
6. Exchange code for tokens
   │
   ▼
7. Store integration (encrypted tokens)
   │
   ▼
8. Fetch Slack channels:
   GET /api/conversations.list
   │
   ▼
9. Store channel list
   │
   ▼
10. Show success notification
```

---

## 4. Project Management Workflows

### 4.1 Project Overview Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              PROJECT OVERVIEW WORKFLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /project-overview
   │
   ▼
2. Check user role and permissions
   │
   ├─► DEVELOPER or TESTER → Redirect to dashboard (access denied)
   │
   └─► Authorized (MANAGER, ADMIN, PREMIUM, USER)
       │
       ▼
3. Fetch user's projects from database
   │
   ├─► No projects → Show empty state with "Connect Integration"
   │
   └─► Has projects
       │
       ▼
4. Group projects by integration type:
   - Jira projects
   - Trello boards
   - TestRail projects
   │
   ▼
5. For each project, fetch latest data:
   │
   ├─► Jira: GET /rest/api/3/project/{projectId}
   ├─► Trello: GET /1/boards/{boardId}
   └─► TestRail: GET /api/v2/get_project/{projectId}
   │
   ▼
6. Calculate project analytics:
   - Total issues/cards/test cases
   - Status distribution
   - Completion percentage
   - Recent activity
   │
   ▼
7. Render project cards with:
   - Project name and description
   - Status indicators
   - Quick stats
   - Last updated timestamp
   │
   ▼
8. User can:
   - Click project → Navigate to project details
   - Filter by integration type
   - Search projects
   - Refresh data
```

### 4.2 Project Details Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              PROJECT DETAILS WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. User clicks on project card
   │
   ▼
2. Navigate to /project/{projectId}
   │
   ▼
3. Fetch project details:
   - Project metadata
   - Issues/cards/test cases
   - Team members
   - Custom fields
   │
   ▼
4. Determine project type (Jira/Trello/TestRail)
   │
   ▼
5. Fetch detailed data from integration API
   │
   ├─► Jira:
   │   - Project details
   │   - Issues with full details
   │   - Statuses, priorities, assignees
   │
   ├─► Trello:
   │   - Board details
   │   - Cards with full details
   │   - Lists, labels, members
   │
   └─► TestRail:
       - Project details
       - Test cases
       - Test runs
       - Suites and sections
       │
       ▼
6. Calculate analytics:
   - Status distribution (pie chart)
   - Issue types (bar chart)
   - Assignee workload (bar chart)
   - Timeline (line chart)
   │
   ▼
7. Render project details page:
   - Project header with key info
   - Analytics charts
   - Issues/cards list
   - Filters and search
   │
   ▼
8. Set up real-time updates:
   - Subscribe to webhook events
   - Enable auto-refresh on changes
   │
   ▼
9. User interactions:
   - Filter by status, assignee, type
   - Search issues/cards
   - Sort by various fields
   - Export data
   - View Gantt chart
   - View Kanban board
```

### 4.3 Kanban Board Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              KANBAN BOARD WORKFLOW                              │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /board
   │
   ▼
2. Select project to view
   │
   ▼
3. Fetch project issues/cards
   │
   ▼
4. Group by status/column:
   - To Do
   - In Progress
   - In Review
   - Done
   │
   ▼
5. Render Kanban board:
   - Columns for each status
   - Cards in each column
   │
   ▼
6. User can drag and drop cards:
   │
   ├─► Card moved to new column
   │   │
   │   ├─► Update card status via API
   │   ├─► Update database
   │   ├─► Broadcast webhook event
   │   └─► Refresh board
   │
   └─► Card reordered within column
       │
       └─► Update order in database
       │
       ▼
7. Real-time updates:
   - Listen for webhook events
   - Auto-refresh board on changes
   │
   ▼
8. User can:
   - Click card → View details
   - Create new card
   - Filter cards
   - Search cards
```

### 4.3.1 Board Filter: Definition and Behavior

#### What Is a Board Filter?

A **board filter** is a saved query (typically expressed in a JQL-like or structured form) that defines **which issues belong to a board**. It is the single source of truth for the board’s scope: the filter is evaluated against the issue store, and only issues that match the filter are considered part of that board.

- **Boards do not store issues.** They only **display** the set of issues returned by the filter at any given time.
- Any issue that **does not match** the board’s filter will **not** appear on the Board view, in the Backlog, or in any of that board’s sprints.

#### How the Same Filter Is Used Across Views

The **same board filter** is used consistently by:

| View | Use of filter |
|------|-------------------------------|
| **Board** | Only issues matching the filter are shown, grouped by workflow columns (e.g. To Do, In Progress, Done). |
| **Backlog** | The backlog is the set of **filter-matching issues** that are not yet in a sprint (or that are in planning). |
| **Sprint** | A sprint’s issues are the **filter-matching issues** that have been added to that sprint. |

So: one filter → one set of issues → same scope for Board, Backlog, and Sprints. There is no separate “board list” vs “backlog list”; there is one filtered result set, then views and sprint assignment slice it (e.g. by column, by “in sprint” or “backlog”).

#### Features of a Board Filter

A board filter can support, depending on product design:

- **Project scope**
  - Selecting **one or multiple projects** (e.g. `project in (A, B)`).
- **Issue and workflow**
  - **Issue type** (e.g. Story, Bug, Task).
  - **Status** (e.g. open, in progress, resolved).
- **People and structure**
  - **Assignee** (e.g. current user, specific users, unassigned).
  - **Component(s)** (e.g. Backend, Frontend).
- **Classification**
  - **Labels** (one or more).
- **Extensibility**
  - **Custom fields** (e.g. Team, Release, Priority) with conditions.
- **Multi-team / cross-project**
  - **Support for multiple teams or cross-project boards** by including multiple projects and/or teams in the filter (e.g. by project, component, or custom “Team” field).
- **Live updates**
  - **Dynamically updating the board when issue fields change**: the filter is re-evaluated when data changes (e.g. status, assignee, labels). If an issue no longer matches the filter, it disappears from the board, backlog, and that board’s sprints; if it starts matching, it appears.

#### Summary of Behavior

- **Definition:** A board filter is a saved query (e.g. JQL) that defines which issues belong to the board.
- **Single scope:** The same filter drives Board, Backlog, and Sprint views for that board.
- **No storage of issues on the board:** The board only shows the current result set of the filter; it does not “own” or persist the issues.
- **Exclusion:** Any issue not matching the filter does **not** appear on the board, in the backlog, or in that board’s sprints.

### 4.4 Gantt Chart Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              GANTT CHART WORKFLOW                                │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /gantt-view
   │
   ▼
2. Select project(s) to visualize
   │
   ▼
3. Fetch project data:
   - Issues/cards with dates
   - Dependencies
   - Assignees
   │
   ▼
4. Process data for Gantt:
   - Extract start dates
   - Extract due dates
   - Calculate durations
   - Identify dependencies
   │
   ▼
5. Render Gantt chart:
   - Timeline axis (dates)
   - Task bars (start to end)
   - Dependencies (arrows)
   - Milestones (diamonds)
   │
   ▼
6. User interactions:
   - Zoom in/out (time scale)
   - Pan left/right
   - Filter by assignee, status
   - Click task → View details
   - Export as image/PDF
```

---

## 5. Analytics and Reporting Workflows

### 5.1 Velocity Graph Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              VELOCITY GRAPH WORKFLOW                            │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /velocity
   │
   ▼
2. Select project(s) to analyze
   │
   ▼
3. Select date range:
   - Last 30 days
   - Last 90 days
   - Last 6 months
   - Custom range
   │
   ▼
4. Fetch historical data:
   - Issues/cards by status over time
   - Completion dates
   - Status change timestamps
   │
   ▼
5. Calculate velocity metrics:
   - Issues completed per period
   - Story points completed (if available)
   - Average cycle time
   - Throughput trends
   │
   ▼
6. Render velocity graph:
   - Line chart: Velocity over time
   - Bar chart: Completed vs. Planned
   - Trend line
   │
   ▼
7. Display insights:
   - Average velocity
   - Velocity trend (increasing/decreasing)
   - Predictions for next sprint
   │
   ▼
8. User can:
   - Adjust date range
   - Filter by assignee
   - Export data
   - Compare multiple projects
```

### 5.2 Dashboard Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              DASHBOARD WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /dashboard (default landing)
   │
   ▼
2. Check authentication
   │
   ├─► Not authenticated → Redirect to sign-in
   │
   └─► Authenticated
       │
       ▼
3. Fetch user statistics:
   - Total projects
   - Total issues/cards
   - Completed this week
   - In progress
   │
   ▼
4. Fetch recent activity:
   - Latest project updates
   - Recent comments
   - Status changes
   │
   ▼
5. Fetch integration status:
   - Connected integrations
   - Last sync times
   - Sync errors (if any)
   │
   ▼
6. Render dashboard:
   - Statistics cards
   - Activity feed
   - Quick actions
   - Integration status
   │
   ▼
7. User can:
   - Click project → Navigate to details
   - Click integration → Navigate to integrations page
   - Refresh data
   - View notifications
```

---

## 6. AI Feature Workflows

### 6.1 Sentiment Analysis Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              SENTIMENT ANALYSIS WORKFLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /sentiment-analysis
   │
   ▼
2. User selects:
   - Project(s) to analyze
   - Date range
   - Text source (comments, descriptions, both)
   │
   ▼
3. Fetch text data:
   - Issue/card comments
   - Descriptions
   - Update messages
   │
   ▼
4. Prepare text for analysis:
   - Combine text from selected sources
   - Clean and normalize
   - Split into chunks if needed
   │
   ▼
5. Call AI service (Google Genkit):
   - Send text to sentiment analysis model
   - Request sentiment classification
   - Request emotion detection
   │
   ▼
6. Process AI response:
   - Extract sentiment scores (positive/negative/neutral)
   - Extract emotions
   - Identify key phrases
   │
   ▼
7. Calculate insights:
   - Overall sentiment score
   - Sentiment trend over time
   - Potential roadblocks (negative sentiment)
   - Team morale indicators
   │
   ▼
8. Render results:
   - Sentiment distribution chart
   - Timeline of sentiment changes
   - Highlighted negative comments
   - Recommendations
   │
   ▼
9. User can:
   - Drill down into specific comments
   - Export analysis report
   - Set up alerts for negative sentiment
```

### 6.2 AI Test Case Generator Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            AI TEST CASE GENERATOR WORKFLOW                       │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /testcases
   │
   ▼
2. User uploads document:
   - PDF, DOCX, TXT, or Markdown
   - Drag and drop or file picker
   │
   ▼
3. Validate file:
   - Check file type
   - Check file size (max 10MB)
   │
   ├─► Invalid → Show error
   │
   └─► Valid
       │
       ▼
4. Extract text from document:
   - PDF: Extract text using pdfjs-dist
   - DOCX: Parse document
   - TXT/MD: Read directly
   │
   ▼
5. Show processing status
   │
   ▼
6. Call AI service (Google Genkit):
   - Send document content
   - Request test case generation
   - Specify document type detection
   │
   ▼
7. AI analyzes document:
   - Detects document type (game, e-commerce, etc.)
   - Extracts features and requirements
   - Generates test cases by category
   │
   ▼
8. Process AI response:
   - Parse test cases
   - Categorize (Functional, UI/UX, Integration, etc.)
   - Assign priorities
   │
   ▼
9. Render test cases:
   - Expandable cards per test case
   - Category badges
   - Priority indicators
   - Statistics dashboard
   │
   ▼
10. User can:
    - Review test cases
    - Edit test cases
    - Send to Jira (creates issues)
    - Send to Trello (creates cards)
    - Send to TestRail (creates test cases)
    - Export as PDF/Excel
    │
    ▼
11. If sending to integration:
    - Check integration connection
    - Select target project/board
    - Create issues/cards/test cases
    - Show success with IDs
```

### 6.3 Slack Channel Analysis Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            SLACK CHANNEL ANALYSIS WORKFLOW                       │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /communication-overview/slack
   │
   ▼
2. Check Slack integration
   │
   ├─► Not connected → Show "Connect Slack" button
   │
   └─► Connected
       │
       ▼
3. Fetch Slack channels:
   GET /api/conversations.list
   │
   ▼
4. User selects channel(s) to analyze
   │
   ▼
5. Fetch channel messages:
   GET /api/conversations.history?channel={channelId}
   │
   ▼
6. Process messages:
   - Extract text content
   - Identify mentions
   - Extract timestamps
   │
   ▼
7. Call AI service for analysis:
   - Sentiment analysis
   - Topic extraction
   - Engagement metrics
   │
   ▼
8. Calculate insights:
   - Channel activity patterns
   - User engagement levels
   - Mention frequency
   - Sentiment trends
   │
   ▼
9. Render analysis:
   - Activity timeline
   - Engagement charts
   - Mention heatmap
   - Sentiment visualization
   │
   ▼
10. User can:
    - Filter by date range
    - Filter by user
    - Export report
```

---

## 7. Real-time Synchronization Workflows

### 7.1 Webhook Processing Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              WEBHOOK PROCESSING WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. External system (Jira/Trello) sends webhook:
   POST /api/webhooks/{integration}
   │
   ▼
2. System validates webhook:
   - Verify signature (if required)
   - Validate payload format
   │
   ├─► Invalid → Return 400, log error
   │
   └─► Valid
       │
       ▼
3. Parse webhook payload:
   - Extract event type
   - Extract project/board ID
   - Extract issue/card data
   │
   ▼
4. Identify affected user(s):
   - Find users with integration
   - Find users watching project
   │
   ▼
5. Process event:
   │
   ├─► Issue/Card Created
   │   │
   │   └─► Create in database
   │
   ├─► Issue/Card Updated
   │   │
   │   └─► Update in database
   │
   └─► Issue/Card Deleted
       │
       └─► Mark as deleted in database
       │
       ▼
6. Broadcast update:
   - Create webhook event object
   - Add to real-time service queue
   │
   ▼
7. Real-time service:
   - Check for active SSE connections
   │
   ├─► Active connections exist
   │   │
   │   └─► Send update via SSE immediately
   │
   └─► No active connections
       │
       └─► Queue update for later delivery
       │
       ▼
8. Client receives update:
   - WebhookContext processes SSE message
   - Shows toast notification
   - Notifies subscribers
   │
   ▼
9. Auto-refresh hook:
   - Receives event
   - Checks if project matches
   - Triggers debounced refresh (2 seconds)
   │
   ▼
10. Page refreshes data:
    - Fetches latest from API
    - Updates UI
```

### 7.2 Polling Service Workflow (Fallback)

```
┌─────────────────────────────────────────────────────────────────┐
│              POLLING SERVICE WORKFLOW (FALLBACK)                │
└─────────────────────────────────────────────────────────────────┘

1. User opens project details page
   │
   ▼
2. System checks webhook status
   │
   ├─► Webhooks ACTIVE → No polling needed
   │
   └─► Webhooks PENDING or ERROR
       │
       ▼
3. Start polling service:
   - Interval: 30 seconds
   - Query: Fetch last 50 issues/cards
   │
   ▼
4. Each polling cycle:
   │
   ├─► Fetch data from integration API
   │
   ├─► Compare with cached state:
   │   - lastIssueKeys
   │   - lastIssueUpdates
   │
   └─► Detect changes:
       │
       ├─► New item → Broadcast "created" event
       ├─► Updated item → Broadcast "updated" event
       └─► Deleted item → Broadcast "deleted" event
       │
       ▼
5. Update cached state
   │
   ▼
6. Continue polling while:
   - Page is open
   - Webhooks are not active
   │
   ▼
7. Stop polling when:
   - User navigates away
   - Webhooks become active
   - User closes browser
```

### 7.3 Server-Sent Events (SSE) Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              SSE CONNECTION WORKFLOW                             │
└─────────────────────────────────────────────────────────────────┘

1. User opens application
   │
   ▼
2. WebhookContext mounts
   │
   ▼
3. Establish SSE connection:
   GET /api/webhooks/events
   │
   ▼
4. Server creates SSE stream:
   - Sets Content-Type: text/event-stream
   - Keeps connection open
   │
   ▼
5. Send pending updates (if any):
   - Retrieve queued updates for user
   - Send each as SSE message
   │
   ▼
6. Send connection confirmation:
   data: {"type":"connected"}
   │
   ▼
7. Maintain connection:
   - Send heartbeat every 30 seconds
   - Listen for new updates
   │
   ▼
8. When update arrives:
   │
   ├─► Format as SSE message:
   │   data: {"type":"update","integration":"jira",...}
   │
   └─► Send to client
       │
       ▼
9. Client receives message:
   - Parse JSON
   - Process event
   - Show notification
   - Trigger refresh
   │
   ▼
10. Connection management:
    │
    ├─► Connection drops → Auto-reconnect after 3 seconds
    │
    └─► User logs out → Close connection
```

---

## 8. Multi-Tenant Workflows

### 8.1 Tenant Creation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              TENANT CREATION WORKFLOW                            │
└─────────────────────────────────────────────────────────────────┘

1. Admin navigates to /tenants (main app only)
   │
   ▼
2. Admin clicks "Create New Tenant"
   │
   ▼
3. Admin enters tenant details:
   - Tenant name (e.g., "suntechnologies")
   - Display name
   - Description
   │
   ▼
4. System generates tenant configuration:
   - Base path: /{tenant-name}
   - Port: Next available (9005, 9006, etc.)
   - Database: mongodb://mongo-{tenant}:27017/upmy-{tenant}
   │
   ▼
5. Create Docker container:
   - Use tenant-specific docker-compose
   - Set environment variables:
     * NEXT_PUBLIC_TENANT_BASEPATH=/{tenant-name}
     * NEXT_PUBLIC_HOST_IP={host-ip}
     * MONGO_URI={tenant-db-uri}
   │
   ▼
6. Create MongoDB database:
   - Initialize database
   - Create collections
   │
   ▼
7. Start tenant container:
   docker-compose up -d
   │
   ▼
8. Verify tenant is running:
   - Health check: https://{host}:{port}/{tenant}/api/health
   │
   ▼
9. Store tenant metadata in main app database
   │
   ▼
10. Show success notification
```

### 8.2 Tenant OAuth Routing Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            TENANT OAUTH ROUTING WORKFLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. User in tenant app initiates OAuth
   │
   ▼
2. Tenant app generates state with tenant info:
   {
     tenant: "suntechnologies",
     port: "9005",
     userId: "user123"
   }
   │
   ▼
3. Encode state (Base64)
   │
   ▼
4. Redirect to OAuth provider with:
   - redirect_uri: Main app callback URL
   - state: Encoded tenant info
   │
   ▼
5. OAuth provider redirects to main app:
   /api/oauth-router/{integration}/callback?code=XXX&state=YYY
   │
   ▼
6. Main app (port 9003) receives callback
   │
   ▼
7. Parse state to extract tenant info
   │
   ▼
8. Exchange code for tokens (using main app credentials)
   │
   ▼
9. Prepare integration data
   │
   ▼
10. Forward to tenant:
    POST https://{host}:{port}/{tenant}/api/oauth-callback/{integration}
    Body: { integrationData }
    │
    ▼
11. Tenant receives data:
    - Stores integration in tenant database
    - Links to user
    │
    ▼
12. Main app redirects user:
    https://{host}:{port}/{tenant}/integrations?{integration}_connected=true
```

### 8.3 Tenant User Registration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            TENANT USER REGISTRATION WORKFLOW                    │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to tenant URL:
   https://{host}:{port}/{tenant}/auth/register
   │
   ▼
2. System detects tenant (has basePath)
   │
   ▼
3. User fills registration form
   │
   ▼
4. Submit to /api/auth/register
   │
   ▼
5. System creates user:
   - Sets isVerified = false (requires verification)
   - Generates verification token
   │
   ▼
6. Send verification email:
   - Extract origin from request headers
   - Generate verification link with tenant basePath
   - Send via SMTP or Zapier webhook
   │
   ▼
7. User receives email
   │
   ▼
8. User clicks verification link:
   {origin}/{tenant}/api/auth/verify?token={token}
   │
   ▼
9. System verifies token:
   - Checks token validity
   - Checks expiration
   │
   ▼
10. Update user:
    - Set isVerified = true
    - Clear verification token
    │
    ▼
11. Redirect to sign-in page
```

---

## 9. Administrative Workflows

### 9.1 User Management Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              USER MANAGEMENT WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Admin navigates to /admin
   │
   ▼
2. Check admin role
   │
   ├─► Not admin → Redirect to dashboard
   │
   └─► Admin
       │
       ▼
3. Navigate to user management
   │
   ▼
4. Fetch all users:
   - List users with pagination
   - Filter by role
   - Search by name/email
   │
   ▼
5. Admin can:
   │
   ├─► View user details
   │   │
   │   └─► Show: Email, Name, Role, Status, Created date
   │
   ├─► Edit user role
   │   │
   │   ├─► Select new role
   │   ├─► Update allowedPages
   │   └─► Save changes
   │
   ├─► Deactivate user
   │   │
   │   ├─► Set isActive = false
   │   └─► Log audit event
   │
   ├─► Delete user
   │   │
   │   ├─► Confirm deletion
   │   ├─► Delete user record
   │   ├─► Delete related data (integrations, projects)
   │   └─► Log audit event
   │
   └─► Create user
       │
       ├─► Fill user form
       ├─► Generate password (or send invite)
       └─► Create user
```

### 9.2 Role Management Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              ROLE MANAGEMENT WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Admin navigates to /admin/roles
   │
   ▼
2. View current role assignments
   │
   ▼
3. Admin can edit role permissions:
   │
   ├─► Select user
   ├─► View current role and allowedPages
   ├─► Modify allowedPages:
   │   - Add pages
   │   - Remove pages
   │   - Reset to default for role
   └─► Save changes
   │
   ▼
4. System updates:
   - Update user record
   - Log audit event
   - Invalidate user session (force re-login)
   │
   ▼
5. Show success notification
```

### 9.3 Tenant Management Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              TENANT MANAGEMENT WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. Admin navigates to /tenants (main app)
   │
   ▼
2. View tenant list:
   - Tenant name
   - Status (running/stopped)
   - Port
   - User count
   - Created date
   │
   ▼
3. Admin can:
   │
   ├─► Create tenant
   │   │
   │   └─► Follow tenant creation workflow
   │
   ├─► Start tenant
   │   │
   │   └─► docker-compose up -d
   │
   ├─► Stop tenant
   │   │
   │   └─► docker-compose stop
   │
   ├─► View tenant logs
   │   │
   │   └─► docker-compose logs
   │
   ├─► Delete tenant
   │   │
   │   ├─► Stop container
   │   ├─► Remove container
   │   ├─► Remove database (optional)
   │   └─► Remove metadata
   │
   └─► Access tenant
      │
      └─► Open tenant URL in new tab
```

---

## 10. Error Handling and Recovery Workflows

### 10.1 Integration Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│            INTEGRATION ERROR HANDLING WORKFLOW                  │
└─────────────────────────────────────────────────────────────────┘

1. API call to integration fails
   │
   ▼
2. Check error type:
   │
   ├─► 401 Unauthorized (Token expired)
   │   │
   │   ├─► Attempt token refresh
   │   │
   │   ├─► Refresh succeeds → Retry request
   │   │
   │   └─► Refresh fails → Mark integration as disconnected
   │       │
   │       └─► Show error: "Please reconnect {integration}"
   │
   ├─► 403 Forbidden (Insufficient permissions)
   │   │
   │   └─► Show error: "Insufficient permissions. Please check {integration} settings."
   │
   ├─► 404 Not Found (Resource doesn't exist)
   │   │
   │   └─► Show error: "Resource not found. It may have been deleted."
   │
   ├─► 429 Rate Limited
   │   │
   │   ├─► Extract retry-after header
   │   └─► Retry after delay
   │
   ├─► 500+ Server Error
   │   │
   │   └─► Show error: "{integration} is temporarily unavailable. Please try again later."
   │
   └─► Network Error
       │
       └─► Show error: "Connection failed. Please check your internet connection."
       │
       ▼
3. Log error:
   - Error type
   - Error message
   - Timestamp
   - User ID
   - Integration type
   │
   ▼
4. Update integration status:
   - Set lastError
   - Set lastErrorTime
   - Increment error count
   │
   ▼
5. If error count exceeds threshold:
   - Mark integration as error state
   - Send notification to user
   - Disable auto-sync
```

### 10.2 Token Refresh Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              TOKEN REFRESH WORKFLOW                             │
└─────────────────────────────────────────────────────────────────┘

1. API call requires authentication
   │
   ▼
2. Check token expiration
   │
   ├─► Token valid → Use token
   │
   └─► Token expired or expiring soon
       │
       ▼
3. Retrieve refresh token from database
   │
   ├─► No refresh token → Return error (reconnect required)
   │
   └─► Refresh token exists
       │
       ▼
4. Call token refresh endpoint:
   │
   ├─► Jira: POST /oauth/token (grant_type=refresh_token)
   ├─► Slack: POST /api/oauth.v2.access (refresh_token)
   └─► Trello: N/A (tokens don't expire)
   │
   ▼
5. Receive new tokens:
   - accessToken
   - refreshToken (new)
   - expiresAt
   │
   ├─► Refresh fails → Mark integration as disconnected
   │
   └─► Refresh succeeds
       │
       ▼
6. Update database:
   - Store new accessToken (encrypted)
   - Store new refreshToken (encrypted)
   - Update expiresAt
   │
   ▼
7. Retry original API call with new token
```

### 10.3 Data Sync Recovery Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│            DATA SYNC RECOVERY WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Sync operation fails
   │
   ▼
2. Log failure:
   - Sync type
   - Error details
   - Timestamp
   │
   ▼
3. Check retry eligibility:
   │
   ├─► Transient error (network, rate limit)
   │   │
   │   └─► Schedule retry with exponential backoff
   │
   └─► Permanent error (invalid credentials, deleted resource)
       │
       └─► Mark sync as failed, don't retry
       │
       ▼
4. Retry logic:
   - First retry: After 1 minute
   - Second retry: After 5 minutes
   - Third retry: After 15 minutes
   - Max retries: 3
   │
   ▼
5. If all retries fail:
   - Mark sync as failed
   - Notify user
   - Show error in UI
   │
   ▼
6. User can manually retry:
   - Click "Retry Sync" button
   - System attempts sync again
   - If succeeds → Clear error state
```

---

## Appendix A: Workflow Diagrams Summary

### A.1 Authentication Flows
- User Registration → Email Verification (tenants) → Sign In
- OAuth Flow → Callback → Session Creation
- Magic Link → Email → Token Validation → Session Creation

### A.2 Integration Flows
- Connect Integration → OAuth Authorization → Token Storage → Project Sync
- Project Sync → Fetch Data → Process → Store → Update Analytics

### A.3 Real-time Update Flows
- External Change → Webhook/Polling → Event Detection → Broadcast → SSE → Client Update → UI Refresh

### A.4 Multi-Tenant Flows
- Tenant Creation → Container Setup → Database Init → OAuth Routing → User Registration

---

## Appendix B: Error Codes and Handling

| Error Code | Description | User Action |
|------------|-------------|-------------|
| AUTH_001 | Invalid credentials | Check email/password |
| AUTH_002 | Account locked | Wait or contact admin |
| AUTH_003 | Email not verified | Check email for verification link |
| INT_001 | Integration disconnected | Reconnect integration |
| INT_002 | Token expired | System auto-refreshes, or reconnect |
| INT_003 | Insufficient permissions | Check integration permissions |
| SYNC_001 | Sync failed | Retry sync manually |
| SYNC_002 | Rate limited | Wait and retry |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2025 | System Architect | Initial workflow documentation |

---

**End of Document**

