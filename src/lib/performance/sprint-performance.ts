import { ObjectId } from 'mongodb'
import { getCollection, COLLECTIONS, toObjectId } from '@/lib/db/mongodb'
import {
  CustomBoardCard,
  Sprint,
  CustomBoard,
  PerformanceConfig,
  IssueEvaluation,
  IssueCompletionCategory,
  SprintPerformanceRecord,
  getPerformanceConfig,
  upsertPerformanceConfig,
  saveSprintPerformance,
  getCardsBySprint,
  getSprintById,
} from '@/lib/db/database'

const DEFAULT_WEIGHTS = {
  very_early: 100,
  early: 85,
  on_time: 70,
  late: 35,
  not_completed: 0,
}

const DEFAULT_THRESHOLDS = {
  veryEarlyDays: 3,
  earlyDays: 1,
  lateToleranceDays: 0,
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return (b.getTime() - a.getTime()) / msPerDay
}

export function classifyIssue(
  card: CustomBoardCard,
  sprint: Sprint,
  board: CustomBoard,
  config: PerformanceConfig
): IssueEvaluation {
  const doneColumn = board.columns[board.columns.length - 1]
  const isCompleted = card.columnName === doneColumn
  const effectiveDueDate = card.dueDate ? new Date(card.dueDate) : (sprint.endDate ? new Date(sprint.endDate) : null)
  const sprintEnd = sprint.endDate ? new Date(sprint.endDate) : null

  if (!isCompleted) {
    return {
      cardId: card._id.toString(),
      cardTitle: card.title,
      assigneeId: card.assigneeId || '',
      assigneeName: card.assigneeName || 'Unassigned',
      dueDate: card.dueDate,
      completedAt: undefined,
      sprintEndDate: sprint.endDate,
      category: 'not_completed',
      score: config.scoreWeights.not_completed,
      daysDifference: null,
    }
  }

  const completionDate = card.completedAt
    ? new Date(card.completedAt)
    : new Date(card.updatedAt)

  if (!effectiveDueDate) {
    return {
      cardId: card._id.toString(),
      cardTitle: card.title,
      assigneeId: card.assigneeId || '',
      assigneeName: card.assigneeName || 'Unassigned',
      dueDate: card.dueDate,
      completedAt: card.completedAt,
      sprintEndDate: sprint.endDate,
      category: 'on_time',
      score: config.scoreWeights.on_time,
      daysDifference: 0,
    }
  }

  const diff = daysBetween(completionDate, effectiveDueDate)
  let category: IssueCompletionCategory
  let score: number

  if (diff >= config.veryEarlyDaysThreshold) {
    category = 'very_early'
    score = config.scoreWeights.very_early
  } else if (diff >= config.earlyDaysThreshold) {
    category = 'early'
    score = config.scoreWeights.early
  } else if (diff >= -config.lateToleranceDays) {
    category = 'on_time'
    score = config.scoreWeights.on_time
  } else {
    category = 'late'
    score = config.scoreWeights.late
  }

  if (sprintEnd && completionDate > sprintEnd) {
    category = 'late'
    score = config.scoreWeights.late
  }

  return {
    cardId: card._id.toString(),
    cardTitle: card.title,
    assigneeId: card.assigneeId || '',
    assigneeName: card.assigneeName || 'Unassigned',
    dueDate: card.dueDate,
    completedAt: card.completedAt,
    sprintEndDate: sprint.endDate,
    category,
    score,
    daysDifference: Math.round(diff * 10) / 10,
  }
}

export async function calculateUserSprintPerformance(
  boardId: string,
  sprintId: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<SprintPerformanceRecord | null> {
  const boardOid = toObjectId(boardId)
  const sprintOid = toObjectId(sprintId)
  if (!boardOid || !sprintOid) return null

  const boardCollection = await getCollection(COLLECTIONS.CUSTOM_BOARDS)
  const board = await boardCollection.findOne({ _id: boardOid }) as CustomBoard | null
  if (!board || board.columns.length === 0) return null

  const sprint = await getSprintById(sprintId)
  if (!sprint) return null

  let config = await getPerformanceConfig(boardId)
  if (!config) {
    config = await upsertPerformanceConfig(boardId, {})
  }

  const allCards = await getCardsBySprint(boardId, sprintId)
  const userCards = allCards.filter(c => c.assigneeId === userId)

  if (userCards.length === 0) return null

  const evaluations: IssueEvaluation[] = userCards.map(card =>
    classifyIssue(card, sprint, board, config!)
  )

  const veryEarlyCount = evaluations.filter(e => e.category === 'very_early').length
  const earlyCount = evaluations.filter(e => e.category === 'early').length
  const onTimeCount = evaluations.filter(e => e.category === 'on_time').length
  const lateCount = evaluations.filter(e => e.category === 'late').length
  const notCompletedCount = evaluations.filter(e => e.category === 'not_completed').length
  const completedIssues = evaluations.filter(e => e.category !== 'not_completed').length

  const rawScore = evaluations.reduce((sum, e) => sum + e.score, 0)
  const maxPossible = userCards.length * config.scoreWeights.very_early
  const normalizedPercentage = maxPossible > 0
    ? Math.round(Math.min(100, Math.max(0, (rawScore / maxPossible) * 100)))
    : 0

  const record: Omit<SprintPerformanceRecord, '_id'> = {
    boardId: boardOid,
    sprintId: sprintOid,
    sprintName: sprint.name,
    userId,
    userName,
    userEmail,
    totalIssues: userCards.length,
    completedIssues,
    veryEarlyCount,
    earlyCount,
    onTimeCount,
    lateCount,
    notCompletedCount,
    rawScore,
    normalizedPercentage,
    issueEvaluations: evaluations,
    calculatedAt: new Date(),
    isFinal: sprint.status === 'completed',
  }

  return saveSprintPerformance(record)
}

export async function calculateAllUsersSprintPerformance(
  boardId: string,
  sprintId: string
): Promise<SprintPerformanceRecord[]> {
  const boardOid = toObjectId(boardId)
  const sprintOid = toObjectId(sprintId)
  if (!boardOid || !sprintOid) return []

  const sprint = await getSprintById(sprintId)
  if (!sprint) return []

  const allCards = await getCardsBySprint(boardId, sprintId)

  const userMap = new Map<string, { name: string; email: string }>()
  for (const card of allCards) {
    if (card.assigneeId && !userMap.has(card.assigneeId)) {
      userMap.set(card.assigneeId, {
        name: card.assigneeName || 'Unknown',
        email: card.assigneeEmail || '',
      })
    }
  }

  const results: SprintPerformanceRecord[] = []
  for (const [uid, info] of userMap) {
    const record = await calculateUserSprintPerformance(
      boardId, sprintId, uid, info.name, info.email
    )
    if (record) results.push(record)
  }

  return results
}

export function calculateTeamPerformance(
  records: SprintPerformanceRecord[],
  strategy: 'average' | 'weighted_average' = 'average'
): number {
  if (records.length === 0) return 0

  if (strategy === 'weighted_average') {
    const totalIssues = records.reduce((s, r) => s + r.totalIssues, 0)
    if (totalIssues === 0) return 0
    const weightedSum = records.reduce((s, r) => s + r.normalizedPercentage * r.totalIssues, 0)
    return Math.round(weightedSum / totalIssues)
  }

  const sum = records.reduce((s, r) => s + r.normalizedPercentage, 0)
  return Math.round(sum / records.length)
}
