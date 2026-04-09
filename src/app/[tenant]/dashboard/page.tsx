'use client'

import { useState, useEffect, Suspense } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings, LogOut, Shield, Crown, AlertCircle, CheckCircle, Clock, Users, FolderKanban, Activity, Calendar, TrendingUp, Zap, Sparkles, ArrowUpRight, ArrowRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useIntegrations } from '@/hooks/useIntegrations'
import Link from 'next/link'

interface DashboardStats {
  user: {
    id: string
    name: string
    email: string
    image: string | null
    role: string
    subscription: string
    isActive: boolean
    createdAt: string
    lastLoginAt: string | null
  }
  stats: {
    projectCount: number
    integrationCount: number
    accountAge: number
    lastLogin: string | null
    isActive: boolean
    subscription: string
    role: string
  }
  integrations: {
    jira: {
      connected: boolean
      integration: any
      projects: any[]
    }
    trello: {
      connected: boolean
      integration: any
      projects: any[]
    }
    total: number
    connected: number
  }
  projects: Array<{
    id: string
    name: string
    isActive: boolean
    createdAt: string
  }>
  recentActivity: Array<{
    id: string
    action: string
    description: string
    timestamp: string
    location: string
  }>
  systemStats: {
    totalUsers: number
    totalProjects: number
    totalIntegrations: number
  }
}

function DashboardContent() {
  const { user, logout } = useAuth()
  const searchParams = useSearchParams()
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { integrations, summary } = useIntegrations()

  const isAdmin = user?.role === 'ADMIN'
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${basePath}/api/dashboard/stats`)
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats')
        }
        const data = await response.json()
        setDashboardStats(data)
      } catch (err) {
        console.error('Error fetching dashboard stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch dashboard stats')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardStats()
  }, [basePath])

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`
    return date.toLocaleDateString()
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Crown className="h-4 w-4" />
      case 'MANAGER':
        return <Shield className="h-4 w-4" />
      case 'DEVELOPER':
        return <Activity className="h-4 w-4" />
      case 'TESTER':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Users className="h-4 w-4" />
    }
  }

  const getRoleGradient = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'from-amber-500 to-orange-500'
      case 'MANAGER':
        return 'from-blue-500 to-cyan-500'
      case 'DEVELOPER':
        return 'from-emerald-500 to-teal-500'
      case 'TESTER':
        return 'from-violet-500 to-purple-500'
      default:
        return 'from-slate-500 to-slate-600'
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 stagger-children">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-10 w-72 skeleton-shimmer" />
            <Skeleton className="h-5 w-96 mt-3 skeleton-shimmer" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full skeleton-shimmer" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-1 skeleton-shimmer" />
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28 skeleton-shimmer" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-20 mb-2 skeleton-shimmer" />
                <Skeleton className="h-3 w-36 skeleton-shimmer" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="animate-scale-in">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  // Calculate project count excluding TestRail (only Jira and Trello)
  // Always use summary if available to avoid showing incorrect count during initial load
  // When summary is not available yet, calculate from integrations if available, otherwise show 0
  const projectCount = summary 
    ? (summary.jiraProjects + summary.trelloProjects) 
    : integrations 
      ? ((integrations.jira?.projects?.length || 0) + (integrations.trello?.projects?.length || 0))
      : 0;
  // Calculate connected integrations count
  const connectedCount = summary?.totalIntegrations || 
    (integrations ? 
      [integrations.jira, integrations.trello, integrations.testrail, integrations.slack].filter(i => i?.connected).length 
      : dashboardStats?.integrations.connected || 0);
  
  // Total available integrations: Jira, Trello, TestRail, Slack, GitHub, Teams = 6
  const totalAvailableIntegrations = 6;
  
  const integrationCount = connectedCount;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-in-top">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Welcome back, <span className="text-gradient">{dashboardStats?.user.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'there'}!</span>
            </h1>
            <Sparkles className="h-7 w-7 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground text-lg">
            Here's what's happening with your projects today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`bg-gradient-to-r ${getRoleGradient(user?.role || 'USER')} text-white border-0 px-4 py-1.5 text-sm font-medium shadow-md`}>
            {getRoleIcon(user?.role || 'USER')}
            <span className="ml-1.5">{user?.role || 'USER'}</span>
          </Badge>
          <Button variant="outline" size="sm" onClick={() => logout()} className="rounded-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {searchParams.get('registered') === 'true' && (
        <Alert className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 animate-scale-in">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <AlertDescription className="text-emerald-700 dark:text-emerald-300 font-medium">
            Welcome to UPMY! Your account has been created successfully. Start by connecting your project management tools.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        {/* Account Status */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Account Status</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">Active</div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Last login: {dashboardStats?.stats.lastLogin ? formatRelativeTime(dashboardStats.stats.lastLogin) : 'Never'}
            </p>
          </CardContent>
        </Card>

        {/* Projects */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <FolderKanban className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{projectCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {projectCount === 1 ? 'project' : 'projects'} synced
            </p>
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card className="group relative overflow-hidden card-hover">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Integrations</CardTitle>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Zap className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{integrationCount}<span className="text-lg text-muted-foreground font-normal">/{totalAvailableIntegrations}</span></div>
            <p className="text-sm text-muted-foreground mt-1">
              {integrationCount === 1 ? 'integration' : 'integrations'} active
            </p>
          </CardContent>
        </Card>

        {/* System Users (Admin Only) */}
        {isAdmin && (
          <Card className="group relative overflow-hidden card-hover">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Users className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{dashboardStats?.systemStats.totalUsers || 0}</div>
              <p className="text-sm text-muted-foreground mt-1">
                Registered users
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Live Activity and Integration Status */}
      <div className="grid gap-6 md:grid-cols-2 stagger-children">
        {/* Recent Activity */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Your latest actions and updates</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dashboardStats?.recentActivity && dashboardStats.recentActivity.length > 0 ? (
              <div className="divide-y divide-border/50">
                {dashboardStats.recentActivity.slice(0, 5).map((activity, index) => (
                  <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-primary to-purple-500 shadow-md shadow-primary/30"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(activity.timestamp)} • {activity.location}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integration Status */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Integration Status
                </CardTitle>
                <CardDescription>Connected tools and their status</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary">
                <Link href="/integrations" className="flex items-center gap-1">
                  Manage <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {/* Jira Status */}
              <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium">Jira</span>
                    <p className="text-xs text-muted-foreground">Project Management</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations?.jira.connected ? (
                    <>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {summary?.jiraProjects || 0} projects
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
              </div>

              {/* Trello Status */}
              <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                      <path d="M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44H9c.795 0 1.44.645 1.44 1.44v13.62zm10.44-6c0 .795-.645 1.44-1.44 1.44h-4.44c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44h4.44c.795 0 1.44.645 1.44 1.44v7.62z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium">Trello</span>
                    <p className="text-xs text-muted-foreground">Task Management</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations?.trello?.connected ? (
                    <>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {summary?.trelloProjects || 0} boards
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
              </div>

              {/* Slack Status */}
              <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 5.042a2.528 2.528 0 0 1 2.522-2.52A2.528 2.528 0 0 1 24 5.042a2.528 2.528 0 0 1-2.522 2.521h-2.522V5.042zM17.688 5.042a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v2.52zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium">Slack</span>
                    <p className="text-xs text-muted-foreground">Team Communication</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations?.slack?.connected ? (
                    <>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {summary?.slackChannels || 0} channels
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
              </div>

              {/* TestRail Status */}
              <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-md">
                    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 17.5L5.5 12l1.5-1.5 3.5 3.5 7.5-7.5L19.5 7l-9 10.5z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium">TestRail</span>
                    <p className="text-xs text-muted-foreground">Test Management</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integrations?.testrail?.connected ? (
                    <>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        {summary?.testrailProjects || 0} projects
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role-Specific Content */}
      {user?.role === 'MANAGER' && (
        <Card className="overflow-hidden animate-slide-in-bottom">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Manager Dashboard
            </CardTitle>
            <CardDescription>Tools and insights for project management</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/project-overview" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold group-hover:text-primary transition-colors">Team Overview</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Monitor team performance and project progress
                </p>
              </Link>
              <Link href="/velocity" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold group-hover:text-primary transition-colors">Resource Allocation</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Optimize team resources and workload distribution
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === 'DEVELOPER' && (
        <Card className="overflow-hidden animate-slide-in-bottom">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              Developer Workspace
            </CardTitle>
            <CardDescription>Tools and resources for development tasks</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/board" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <FolderKanban className="h-5 w-5 text-emerald-500" />
                  <h4 className="font-semibold group-hover:text-emerald-600 transition-colors">Task Management</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Track your assigned tasks and progress
                </p>
              </Link>
              <Link href="/integrations" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-5 w-5 text-emerald-500" />
                  <h4 className="font-semibold group-hover:text-emerald-600 transition-colors">Code Integration</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect with version control and CI/CD tools
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === 'TESTER' && (
        <Card className="overflow-hidden animate-slide-in-bottom">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-violet-500/10 to-purple-500/10">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-violet-500" />
              Testing Hub
            </CardTitle>
            <CardDescription>Quality assurance and testing tools</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/testcases" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-violet-500/50 hover:bg-violet-500/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="h-5 w-5 text-violet-500" />
                  <h4 className="font-semibold group-hover:text-violet-600 transition-colors">Test Cases</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-violet-500 transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Manage and execute test cases
                </p>
              </Link>
              <Link href="/board" className="group p-5 border-2 border-dashed border-border/50 rounded-xl hover:border-violet-500/50 hover:bg-violet-500/5 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="h-5 w-5 text-violet-500" />
                  <h4 className="font-semibold group-hover:text-violet-600 transition-colors">Bug Tracking</h4>
                  <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-violet-500 transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Report and track software defects
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-10 w-72 skeleton-shimmer" />
            <Skeleton className="h-5 w-96 mt-3 skeleton-shimmer" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-1 skeleton-shimmer" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24 skeleton-shimmer" />
                <Skeleton className="h-10 w-10 rounded-xl skeleton-shimmer" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-20 mb-2 skeleton-shimmer" />
                <Skeleton className="h-4 w-28 skeleton-shimmer" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
