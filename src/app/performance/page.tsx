"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TrendingUp,
  Users,
  Target,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Zap,
  Award,
  Settings2,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Eye,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

interface Sprint {
  _id: string
  boardId: string
  name: string
  status: "planning" | "active" | "completed"
  startDate?: string
  endDate?: string
  completedAt?: string
}

interface Board {
  _id: string
  name: string
  columns: string[]
}

interface IssueEvaluation {
  cardId: string
  cardTitle: string
  assigneeId: string
  assigneeName: string
  dueDate?: string
  completedAt?: string
  sprintEndDate?: string
  category: "very_early" | "early" | "on_time" | "late" | "not_completed"
  score: number
  daysDifference: number | null
}

interface PerformanceRecord {
  _id: string
  boardId: string
  sprintId: string
  sprintName: string
  userId: string
  userName: string
  userEmail: string
  totalIssues: number
  completedIssues: number
  veryEarlyCount: number
  earlyCount: number
  onTimeCount: number
  lateCount: number
  notCompletedCount: number
  rawScore: number
  normalizedPercentage: number
  issueEvaluations: IssueEvaluation[]
  calculatedAt: string
  isFinal: boolean
}

interface PerformanceConfig {
  veryEarlyDaysThreshold: number
  earlyDaysThreshold: number
  lateToleranceDays: number
  scoreWeights: {
    very_early: number
    early: number
    on_time: number
    late: number
    not_completed: number
  }
  teamAggregation: "average" | "weighted_average"
  ownershipRule: "completer" | "longest_owner" | "split"
}

const CATEGORY_CONFIG = {
  very_early: { label: "Very Early", color: "#10b981", icon: Zap, bg: "bg-emerald-500/10", text: "text-emerald-600" },
  early: { label: "Early", color: "#3b82f6", icon: CheckCircle2, bg: "bg-blue-500/10", text: "text-blue-600" },
  on_time: { label: "On Time", color: "#8b5cf6", icon: Clock, bg: "bg-violet-500/10", text: "text-violet-600" },
  late: { label: "Late", color: "#f59e0b", icon: AlertCircle, bg: "bg-amber-500/10", text: "text-amber-600" },
  not_completed: { label: "Not Completed", color: "#ef4444", icon: XCircle, bg: "bg-red-500/10", text: "text-red-600" },
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500"
  if (pct >= 60) return "bg-blue-500"
  if (pct >= 40) return "bg-amber-500"
  return "bg-red-500"
}

function getProgressGradient(pct: number): string {
  if (pct >= 80) return "from-emerald-500 to-teal-400"
  if (pct >= 60) return "from-blue-500 to-cyan-400"
  if (pct >= 40) return "from-amber-500 to-orange-400"
  return "from-red-500 to-pink-400"
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

export default function PerformancePage() {
  const { user, hasRole } = useAuth()
  const { toast } = useToast()
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ""
  const isManager = hasRole(["MANAGER", "ADMIN"])

  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>("")
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<string>("")
  const [records, setRecords] = useState<PerformanceRecord[]>([])
  const [teamScore, setTeamScore] = useState<number>(0)
  const [config, setConfig] = useState<PerformanceConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<PerformanceRecord[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"current" | "history" | "overall">("current")
  const [configOpen, setConfigOpen] = useState(false)
  const [editConfig, setEditConfig] = useState<PerformanceConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<string | null>(null)
  const [userHistoryRecords, setUserHistoryRecords] = useState<PerformanceRecord[]>([])

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards?subscribedOnly=false`)
      if (res.ok) {
        const data = await res.json()
        setBoards(data.boards || [])
        if (data.boards?.length > 0 && !selectedBoardId) {
          setSelectedBoardId(data.boards[0]._id)
        }
      }
    } catch (err) {
      console.error("Failed to fetch boards:", err)
    }
  }, [basePath, selectedBoardId])

  const fetchSprints = useCallback(async () => {
    if (!selectedBoardId) return
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints?boardId=${selectedBoardId}`)
      if (res.ok) {
        const data = await res.json()
        const allSprints: Sprint[] = data.sprints || []
        setSprints(allSprints)
        const active = allSprints.find(s => s.status === "active")
        const latestCompleted = allSprints.filter(s => s.status === "completed").sort((a, b) =>
          new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
        )[0]
        if (!selectedSprintId || !allSprints.find(s => s._id === selectedSprintId)) {
          setSelectedSprintId(active?._id || latestCompleted?._id || "")
        }
      }
    } catch (err) {
      console.error("Failed to fetch sprints:", err)
    }
  }, [basePath, selectedBoardId, selectedSprintId])

  const fetchPerformance = useCallback(async () => {
    if (!selectedBoardId || !selectedSprintId) return
    setLoading(true)
    try {
      const view = isManager ? "team" : "sprint"
      const url = `${basePath}/api/custom-boards/performance?boardId=${selectedBoardId}&sprintId=${selectedSprintId}&view=${view}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTeamScore(data.teamScore || 0)
        if (data.config) setConfig(data.config)
      }
    } catch (err) {
      console.error("Failed to fetch performance:", err)
    } finally {
      setLoading(false)
    }
  }, [basePath, selectedBoardId, selectedSprintId, isManager])

  const fetchOverall = useCallback(async () => {
    if (boards.length === 0) return
    setLoading(true)
    try {
      const boardIds = boards.map((b) => b._id).join(",")
      const url = `${basePath}/api/custom-boards/performance?view=overall&boardIds=${encodeURIComponent(boardIds)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTeamScore(data.teamScore || 0)
      }
    } catch (err) {
      console.error("Failed to fetch overall performance:", err)
    } finally {
      setLoading(false)
    }
  }, [basePath, boards])

  const fetchHistory = useCallback(async (userId?: string) => {
    if (!selectedBoardId) return
    try {
      const targetId = userId || user?.id || ""
      const url = `${basePath}/api/custom-boards/performance?boardId=${selectedBoardId}&view=history&userId=${targetId}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (userId) {
          setUserHistoryRecords(data.history || [])
        } else {
          setHistoryRecords(data.history || [])
        }
      }
    } catch (err) {
      console.error("Failed to fetch history:", err)
    }
  }, [basePath, selectedBoardId, user?.id])

  const handleCalculate = useCallback(async () => {
    if (!selectedBoardId || !selectedSprintId) return
    setCalculating(true)
    try {
      const action = isManager ? "recalculate" : "calculate"
      const res = await fetch(`${basePath}/api/custom-boards/performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: selectedBoardId, sprintId: selectedSprintId, action }),
      })
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTeamScore(data.teamScore || 0)
        toast({ title: "Performance Calculated", description: "Sprint performance has been calculated successfully." })
      } else {
        const data = await res.json()
        toast({ title: "Error", description: data.error || "Failed to calculate", variant: "destructive" })
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to calculate performance", variant: "destructive" })
    } finally {
      setCalculating(false)
    }
  }, [basePath, selectedBoardId, selectedSprintId, isManager, toast])

  const handleSaveConfig = useCallback(async () => {
    if (!selectedBoardId || !editConfig) return
    setSavingConfig(true)
    try {
      const res = await fetch(`${basePath}/api/custom-boards/performance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: selectedBoardId, config: editConfig }),
      })
      if (res.ok) {
        const data = await res.json()
        setConfig(data.config)
        setConfigOpen(false)
        toast({ title: "Configuration Saved", description: "Performance scoring configuration updated." })
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration", variant: "destructive" })
    } finally {
      setSavingConfig(false)
    }
  }, [basePath, selectedBoardId, editConfig, toast])

  useEffect(() => { fetchBoards() }, [fetchBoards])
  useEffect(() => { fetchSprints() }, [fetchSprints])
  useEffect(() => {
    if (viewMode === "current") fetchPerformance()
  }, [viewMode, fetchPerformance])
  useEffect(() => {
    if (viewMode === "history") fetchHistory()
  }, [viewMode, fetchHistory])
  useEffect(() => {
    if (viewMode === "overall") fetchOverall()
  }, [viewMode, fetchOverall])

  const selectedSprint = useMemo(() =>
    sprints.find(s => s._id === selectedSprintId), [sprints, selectedSprintId]
  )

  const myRecord = useMemo(() =>
    records.find(r => r.userId === user?.id), [records, user?.id]
  )

  const pieData = useMemo(() => {
    const source = isManager ? records : (myRecord ? [myRecord] : [])
    if (source.length === 0) return []
    const totals = source.reduce((acc, r) => ({
      veryEarly: acc.veryEarly + r.veryEarlyCount,
      early: acc.early + r.earlyCount,
      onTime: acc.onTime + r.onTimeCount,
      late: acc.late + r.lateCount,
      notCompleted: acc.notCompleted + r.notCompletedCount,
    }), { veryEarly: 0, early: 0, onTime: 0, late: 0, notCompleted: 0 })

    return [
      { name: "Very Early", value: totals.veryEarly, color: CATEGORY_CONFIG.very_early.color },
      { name: "Early", value: totals.early, color: CATEGORY_CONFIG.early.color },
      { name: "On Time", value: totals.onTime, color: CATEGORY_CONFIG.on_time.color },
      { name: "Late", value: totals.late, color: CATEGORY_CONFIG.late.color },
      { name: "Not Completed", value: totals.notCompleted, color: CATEGORY_CONFIG.not_completed.color },
    ].filter(d => d.value > 0)
  }, [records, myRecord, isManager])

  const historyChartData = useMemo(() => {
    const source = viewMode === "history"
      ? (selectedUserForHistory ? userHistoryRecords : historyRecords)
      : []
    return source.map(r => ({
      sprint: r.sprintName,
      score: r.normalizedPercentage,
      completed: r.completedIssues,
      total: r.totalIssues,
    })).reverse()
  }, [viewMode, historyRecords, userHistoryRecords, selectedUserForHistory])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sprint Performance"
        icon={<Award className="h-5 w-5 text-white" />}
        gradient="from-indigo-500 to-purple-500"
        description="Track user performance across sprints based on timely task completion."
        actions={
          <div className="flex items-center gap-2">
            {isManager && (
              <Button variant="outline" className="rounded-full" onClick={() => {
                setEditConfig(config || {
                  veryEarlyDaysThreshold: 3,
                  earlyDaysThreshold: 1,
                  lateToleranceDays: 0,
                  scoreWeights: { very_early: 100, early: 85, on_time: 70, late: 35, not_completed: 0 },
                  teamAggregation: "average",
                  ownershipRule: "completer",
                })
                setConfigOpen(true)
              }}>
                <Settings2 className="mr-2 h-4 w-4" />
                Configure
              </Button>
            )}
            <Button
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              onClick={handleCalculate}
              disabled={calculating || !selectedSprintId || viewMode === "overall"}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${calculating ? "animate-spin" : ""}`} />
              {isManager ? "Recalculate" : "Calculate"}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">Board:</Label>
              <Select value={selectedBoardId} onValueChange={(v) => { setSelectedBoardId(v); setSelectedSprintId("") }}>
                <SelectTrigger className="w-[200px] rounded-lg">
                  <SelectValue placeholder="Select Board" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map(b => (
                    <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">Sprint:</Label>
              <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
                <SelectTrigger className="w-[200px] rounded-lg">
                  <SelectValue placeholder="Select Sprint" />
                </SelectTrigger>
                <SelectContent>
                  {sprints.map(s => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                      {s.status === "active" && " (Active)"}
                      {s.status === "completed" && " (Done)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant={viewMode === "current" ? "default" : "outline"}
                size="sm"
                className="rounded-l-full"
                onClick={() => setViewMode("current")}
              >
                <Target className="mr-1.5 h-3.5 w-3.5" />
                Current Sprint
              </Button>
              <Button
                variant={viewMode === "overall" ? "default" : "outline"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("overall")}
              >
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                Overall
              </Button>
              <Button
                variant={viewMode === "history" ? "default" : "outline"}
                size="sm"
                className="rounded-r-full"
                onClick={() => { setViewMode("history"); setSelectedUserForHistory(null) }}
              >
                <History className="mr-1.5 h-3.5 w-3.5" />
                History
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(viewMode === "current" || viewMode === "overall") && (
        <>
          {viewMode === "overall" && (
            <p className="text-sm text-muted-foreground -mt-4">
              Aggregated across all boards and all sprints. Only completed sprint data is included.
            </p>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Team / User Score */}
            <Card className="group relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {viewMode === "overall" ? "Overall " : ""}{isManager ? "Team Score" : "My Score"}
                  </CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">
                    {isManager ? teamScore : (myRecord?.normalizedPercentage ?? 0)}%
                  </span>
                </div>
                <div className="mt-3">
                  <Progress
                    value={isManager ? teamScore : (myRecord?.normalizedPercentage ?? 0)}
                    className="h-2.5"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Issues</CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold">
                  {isManager
                    ? records.reduce((s, r) => s + r.totalIssues, 0)
                    : (myRecord?.totalIssues ?? 0)}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {isManager
                    ? `${records.reduce((s, r) => s + r.completedIssues, 0)} completed`
                    : `${myRecord?.completedIssues ?? 0} completed`}
                </p>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Users Evaluated</CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-bold">{records.length}</span>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedSprint?.status === "completed" ? "Final results" : "In progress"}
                </p>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {viewMode === "overall" ? "Scope" : "Sprint Status"}
                  </CardTitle>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {viewMode === "overall" ? (
                  <>
                    <Badge variant="default" className="text-sm">All boards & sprints</Badge>
                    <p className="text-sm text-muted-foreground mt-2">{boards.length} board(s)</p>
                  </>
                ) : (
                  <>
                    <Badge variant={selectedSprint?.status === "completed" ? "default" : "secondary"} className="text-sm">
                      {selectedSprint?.status === "completed" ? "Completed" : selectedSprint?.status === "active" ? "Active" : "Planning"}
                    </Badge>
                    {selectedSprint?.endDate && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Ends: {new Date(selectedSprint.endDate).toLocaleDateString()}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* User Progress Bars */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle>
                    {viewMode === "overall" ? "Overall " : ""}{isManager ? "Team Members Performance" : "My Performance"}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "overall"
                      ? "Aggregated score across all boards and sprints"
                      : isManager
                        ? "Individual progress for each team member"
                        : "Your sprint performance breakdown"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No performance data yet</p>
                  <p className="text-sm mt-1">Click &quot;{isManager ? "Recalculate" : "Calculate"}&quot; to generate performance scores for this sprint.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(isManager ? records : records.filter(r => r.userId === user?.id)).map(record => (
                    <div key={record._id} className="border rounded-xl overflow-hidden">
                      <button
                        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left"
                        onClick={() => setExpandedUser(expandedUser === record.userId ? null : record.userId)}
                      >
                        <Avatar className="h-10 w-10 border-2 border-background shadow">
                          <AvatarFallback className={`bg-gradient-to-br ${getProgressGradient(record.normalizedPercentage)} text-white text-sm`}>
                            {getInitials(record.userName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{record.userName}</span>
                            {record.isFinal && <Badge variant="outline" className="text-xs">Final</Badge>}
                            {isManager && (
                              <Button
                                variant="ghost" size="sm" className="h-6 px-2 ml-auto"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedUserForHistory(record.userId)
                                  fetchHistory(record.userId)
                                  setViewMode("history")
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                <span className="text-xs">History</span>
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(record.normalizedPercentage)} transition-all duration-500`}
                                  style={{ width: `${record.normalizedPercentage}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-lg font-bold w-14 text-right">{record.normalizedPercentage}%</span>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{record.totalIssues} issues</span>
                            <span>{record.completedIssues} completed</span>
                            <span className="text-emerald-600">{record.veryEarlyCount + record.earlyCount} early</span>
                            <span className="text-amber-600">{record.lateCount} late</span>
                            <span className="text-red-600">{record.notCompletedCount} incomplete</span>
                          </div>
                        </div>
                        {expandedUser === record.userId
                          ? <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      </button>

                      {expandedUser === record.userId && (
                        <div className="border-t bg-muted/30 px-4 py-4">
                          <div className="grid grid-cols-5 gap-3 mb-4">
                            {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(cat => {
                              const cfg = CATEGORY_CONFIG[cat]
                              const count = cat === "very_early" ? record.veryEarlyCount
                                : cat === "early" ? record.earlyCount
                                : cat === "on_time" ? record.onTimeCount
                                : cat === "late" ? record.lateCount
                                : record.notCompletedCount
                              const Icon = cfg.icon
                              return (
                                <div key={cat} className={`${cfg.bg} rounded-lg p-3 text-center`}>
                                  <Icon className={`h-5 w-5 mx-auto mb-1 ${cfg.text}`} />
                                  <div className={`text-xl font-bold ${cfg.text}`}>{count}</div>
                                  <div className="text-xs text-muted-foreground">{cfg.label}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Issue Details</p>
                            {record.issueEvaluations.map(ev => {
                              const cfg = CATEGORY_CONFIG[ev.category]
                              const Icon = cfg.icon
                              return (
                                <div key={ev.cardId} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-background border text-sm">
                                  <Icon className={`h-4 w-4 ${cfg.text} shrink-0`} />
                                  <span className="flex-1 truncate">{ev.cardTitle}</span>
                                  <Badge variant="outline" className={`${cfg.text} border-current text-xs`}>
                                    {cfg.label}
                                  </Badge>
                                  {ev.daysDifference !== null && (
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {ev.daysDifference > 0 ? `${ev.daysDifference}d early` : ev.daysDifference < 0 ? `${Math.abs(ev.daysDifference)}d late` : "on time"}
                                    </span>
                                  )}
                                  <span className="text-xs font-medium w-8 text-right">{ev.score}pt</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribution Chart */}
          {pieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/50">
                  <CardTitle className="text-base">Completion Category Distribution</CardTitle>
                  <CardDescription>Breakdown of issue completion timings</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {isManager && records.length > 1 && (
                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border/50">
                    <CardTitle className="text-base">User Comparison</CardTitle>
                    <CardDescription>Performance scores across team members</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={records.map(r => ({ name: r.userName.split(" ")[0], score: r.normalizedPercentage, issues: r.totalIssues }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" />
                        <YAxis domain={[0, 100]} className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="score" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {viewMode === "history" && (
        <>
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                    <History className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle>
                      {selectedUserForHistory
                        ? `Performance History — ${userHistoryRecords[0]?.userName || "User"}`
                        : "My Performance History"}
                    </CardTitle>
                    <CardDescription>Score progression across sprints</CardDescription>
                  </div>
                </div>
                {selectedUserForHistory && (
                  <Button variant="outline" size="sm" onClick={() => { setSelectedUserForHistory(null); fetchHistory() }}>
                    Back to My History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {historyChartData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No history available</p>
                  <p className="text-sm mt-1">Performance data will appear here after sprints are evaluated.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="sprint" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" name="Score %" stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: "#6366f1" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* History Table */}
          {(selectedUserForHistory ? userHistoryRecords : historyRecords).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sprint-by-Sprint Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">Sprint</th>
                        <th className="text-center py-2 px-3 font-medium">Score</th>
                        <th className="text-center py-2 px-3 font-medium">Total</th>
                        <th className="text-center py-2 px-3 font-medium">Done</th>
                        <th className="text-center py-2 px-3 font-medium text-emerald-600">V.Early</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-600">Early</th>
                        <th className="text-center py-2 px-3 font-medium text-violet-600">On Time</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-600">Late</th>
                        <th className="text-center py-2 px-3 font-medium text-red-600">Incomplete</th>
                        <th className="text-center py-2 px-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedUserForHistory ? userHistoryRecords : historyRecords).map(r => (
                        <tr key={r._id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{r.sprintName}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16">
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(r.normalizedPercentage)}`}
                                    style={{ width: `${r.normalizedPercentage}%` }}
                                  />
                                </div>
                              </div>
                              <span className="font-bold text-sm">{r.normalizedPercentage}%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">{r.totalIssues}</td>
                          <td className="py-2 px-3 text-center">{r.completedIssues}</td>
                          <td className="py-2 px-3 text-center text-emerald-600">{r.veryEarlyCount}</td>
                          <td className="py-2 px-3 text-center text-blue-600">{r.earlyCount}</td>
                          <td className="py-2 px-3 text-center text-violet-600">{r.onTimeCount}</td>
                          <td className="py-2 px-3 text-center text-amber-600">{r.lateCount}</td>
                          <td className="py-2 px-3 text-center text-red-600">{r.notCompletedCount}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant={r.isFinal ? "default" : "secondary"} className="text-xs">
                              {r.isFinal ? "Final" : "Draft"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Configuration Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Performance Configuration
            </DialogTitle>
            <DialogDescription>
              Configure scoring thresholds, weights, and aggregation strategy for this board.
            </DialogDescription>
          </DialogHeader>

          {editConfig && (
            <div className="space-y-6 py-4">
              <div>
                <h4 className="text-sm font-medium mb-3">Time Thresholds (days before due date)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Very Early</Label>
                    <Input
                      type="number"
                      min={1}
                      value={editConfig.veryEarlyDaysThreshold}
                      onChange={e => setEditConfig({ ...editConfig, veryEarlyDaysThreshold: parseInt(e.target.value) || 3 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{"\u2265"} N days early</p>
                  </div>
                  <div>
                    <Label className="text-xs">Early</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editConfig.earlyDaysThreshold}
                      onChange={e => setEditConfig({ ...editConfig, earlyDaysThreshold: parseInt(e.target.value) || 1 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{"\u2265"} N days early</p>
                  </div>
                  <div>
                    <Label className="text-xs">Late Tolerance</Label>
                    <Input
                      type="number"
                      min={0}
                      value={editConfig.lateToleranceDays}
                      onChange={e => setEditConfig({ ...editConfig, lateToleranceDays: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Days after due still "on time"</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Score Weights (points per issue)</h4>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(cat => {
                    const cfg = CATEGORY_CONFIG[cat]
                    return (
                      <div key={cat}>
                        <Label className={`text-xs ${cfg.text}`}>{cfg.label}</Label>
                        <Input
                          type="number"
                          min={0}
                          max={200}
                          value={editConfig.scoreWeights[cat]}
                          onChange={e => setEditConfig({
                            ...editConfig,
                            scoreWeights: { ...editConfig.scoreWeights, [cat]: parseInt(e.target.value) || 0 },
                          })}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Team Aggregation</h4>
                <Select
                  value={editConfig.teamAggregation}
                  onValueChange={v => setEditConfig({ ...editConfig, teamAggregation: v as "average" | "weighted_average" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="average">Simple Average</SelectItem>
                    <SelectItem value="weighted_average">Weighted by Issue Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Ownership Rule</h4>
                <Select
                  value={editConfig.ownershipRule}
                  onValueChange={v => setEditConfig({ ...editConfig, ownershipRule: v as "completer" | "longest_owner" | "split" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completer">Completer (current assignee at completion)</SelectItem>
                    <SelectItem value="longest_owner">Longest Owner</SelectItem>
                    <SelectItem value="split">Split Score</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Determines who receives performance impact when an issue is reassigned during a sprint.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
