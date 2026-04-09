"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertTriangle,
  Link2,
  CheckCircle2,
  Calendar,
  Plus,
  GripVertical,
  Columns3,
  Trash2,
  Edit3,
  UserPlus,
  Clock,
  Tag,
  X,
  MoreHorizontal,
  ArrowLeft,
  Users,
  Shield,
  Eye,
  Check,
  ChevronDown,
  GripHorizontal,
  LayoutList,
  KanbanSquare,
  Inbox,
  Play,
  Square,
  Target,
  ArrowRight,
  ChevronRight,
  ChevronUp,
  Timer,
  Zap,
  List,
  SortAsc,
  SortDesc,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  MessageSquare,
  Activity,
  BarChart3,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import BurndownChart from "@/components/charts/BurndownChart";

import {
  DndContext,
  DragOverlay,
  closestCorners,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ======================== Types ========================

interface BoardData {
  _id: string;
  name: string;
  columns: string[];
  createdBy: string;
  createdByName: string;
  subscribers: string[];
  allowedUsers: string[];
}

interface CardData {
  _id: string;
  boardId: string;
  sprintId?: string | null;
  columnName: string;
  title: string;
  description: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate?: string;
  labels: string[];
  order: number;
  storyPoints?: number;
  dependencies: Array<{
    cardId: string;
    cardTitle?: string;
    type: "depends_on" | "blocked_by";
  }>;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

interface SprintData {
  _id: string;
  boardId: string;
  name: string;
  goal?: string;
  status: "planning" | "active" | "completed";
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
}

type TabView = "backlog" | "board" | "list";

const PRIORITY_CONFIG = {
  CRITICAL: { color: "bg-red-500/20 text-red-400 border-red-500/30", dot: "bg-red-500", label: "Critical", sortOrder: 0 },
  HIGH: { color: "bg-orange-500/20 text-orange-400 border-orange-500/30", dot: "bg-orange-500", label: "High", sortOrder: 1 },
  MEDIUM: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", dot: "bg-blue-500", label: "Medium", sortOrder: 2 },
  LOW: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", dot: "bg-gray-400", label: "Low", sortOrder: 3 },
};

const COLUMN_GRADIENTS = [
  "from-blue-500/20 to-blue-600/5",
  "from-emerald-500/20 to-emerald-600/5",
  "from-violet-500/20 to-violet-600/5",
  "from-amber-500/20 to-amber-600/5",
  "from-pink-500/20 to-pink-600/5",
  "from-cyan-500/20 to-cyan-600/5",
  "from-indigo-500/20 to-indigo-600/5",
  "from-rose-500/20 to-rose-600/5",
];

const COLUMN_ACCENT_COLORS = [
  "border-blue-500",
  "border-emerald-500",
  "border-violet-500",
  "border-amber-500",
  "border-pink-500",
  "border-cyan-500",
  "border-indigo-500",
  "border-rose-500",
];

// ======================== Main Page ========================

export default function CustomBoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.boardId as string;
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || "";
  const { toast } = useToast();
  const { user, isManager, isAdmin } = useAuth();

  const [board, setBoard] = useState<BoardData | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [sprints, setSprints] = useState<SprintData[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>("board");

  // Dialog states
  const [isCreateCardOpen, setIsCreateCardOpen] = useState(false);
  const [createCardColumn, setCreateCardColumn] = useState<string>("");
  const [createCardSprintId, setCreateCardSprintId] = useState<string | null>(null);
  const [isEditCardOpen, setIsEditCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [isDependencyDialogOpen, setIsDependencyDialogOpen] = useState(false);
  const [dependencySourceCard, setDependencySourceCard] = useState<CardData | null>(null);
  const [isCardDetailOpen, setIsCardDetailOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [isAccessPopoverOpen, setIsAccessPopoverOpen] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [showDependenciesOnly, setShowDependenciesOnly] = useState(false);
  const [isBoardFilterOpen, setIsBoardFilterOpen] = useState(false);
  const [boardFilterAssignee, setBoardFilterAssignee] = useState<string>("");
  const [boardFilterPriority, setBoardFilterPriority] = useState<string>("");
  const [boardFilterLabel, setBoardFilterLabel] = useState<string>("");
  const [boardFilterColumn, setBoardFilterColumn] = useState<string>("");
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [isStartSprintOpen, setIsStartSprintOpen] = useState(false);
  const [startingSprintId, setStartingSprintId] = useState<string | null>(null);
  const [isCompleteSprintOpen, setIsCompleteSprintOpen] = useState(false);

  // Form states
  const [newCard, setNewCard] = useState({
    title: "",
    description: "",
    assigneeId: "",
    priority: "MEDIUM" as CardData["priority"],
    dueDate: "",
    labels: "",
    storyPoints: "" as string | number,
  });
  const [newDependency, setNewDependency] = useState({
    targetCardId: "",
    type: "depends_on" as "depends_on" | "blocked_by",
  });
  const [newSprint, setNewSprint] = useState({ name: "", goal: "" });
  const [startSprintForm, setStartSprintForm] = useState({ startDate: "", endDate: "" });
  const [isCreating, setIsCreating] = useState(false);

  const canManage = isManager || isAdmin;

  // Derived data
  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === "active") || null,
    [sprints]
  );
  const planningSprints = useMemo(
    () => sprints.filter((s) => s.status === "planning"),
    [sprints]
  );
  const completedSprints = useMemo(
    () => sprints.filter((s) => s.status === "completed"),
    [sprints]
  );

  const backlogCards = useMemo(
    () => cards.filter((c) => !c.sprintId),
    [cards]
  );

  const activeSprintCards = useMemo(
    () => activeSprint ? cards.filter((c) => c.sprintId === activeSprint._id) : [],
    [cards, activeSprint]
  );

  const burndownData = useMemo(() => {
    if (!activeSprint?.startDate || !activeSprint?.endDate || !board || activeSprintCards.length === 0) return [];
    const totalPoints = activeSprintCards.reduce((s, c) => s + (c.storyPoints ?? 0), 0);
    if (totalPoints === 0) return [];
    const doneCol = board.columns[board.columns.length - 1];
    const completedPoints = activeSprintCards.filter((c) => c.columnName === doneCol).reduce((s, c) => s + (c.storyPoints ?? 0), 0);
    const remaining = totalPoints - completedPoints;
    const start = new Date(activeSprint.startDate);
    const end = new Date(activeSprint.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    const todayIdx = Math.max(0, Math.min(totalDays - 1, Math.ceil((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));
    const idealToday = totalPoints * (1 - todayIdx / totalDays);
    return [
      { date: startStr, remaining: totalPoints, ideal: totalPoints },
      { date: today.toISOString().split("T")[0], remaining, ideal: Math.round(idealToday * 10) / 10 },
      { date: endStr, remaining: 0, ideal: 0 },
    ];
  }, [activeSprint, activeSprintCards, board]);

  const completedSprintsWithVelocity = useMemo(() => {
    return sprints
      .filter((s) => s.status === "completed")
      .map((s) => {
        const sprintCards = cards.filter((c) => c.sprintId === s._id);
        const doneCol = board?.columns?.[board.columns.length - 1];
        const points = doneCol ? sprintCards.filter((c) => c.columnName === doneCol).reduce((sum, c) => sum + (c.storyPoints ?? 0), 0) : sprintCards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0);
        return { ...s, velocity: points };
      })
      .slice(-5);
  }, [sprints, cards, board]);

  const boardFilteredCards = useMemo(() => {
    const base = activeSprint ? activeSprintCards : [];
    let out = base;
    if (boardFilterAssignee) out = out.filter((c) => c.assigneeId === boardFilterAssignee);
    if (boardFilterPriority) out = out.filter((c) => c.priority === boardFilterPriority);
    if (boardFilterLabel) out = out.filter((c) => c.labels?.includes(boardFilterLabel));
    if (boardFilterColumn) out = out.filter((c) => c.columnName === boardFilterColumn);
    return out;
  }, [activeSprint, activeSprintCards, cards, boardFilterAssignee, boardFilterPriority, boardFilterLabel, boardFilterColumn]);

  const hasActiveBoardFilters = !!(boardFilterAssignee || boardFilterPriority || boardFilterLabel || boardFilterColumn);

  // ======================== Data Fetching ========================

  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, cardsRes, usersRes, sprintsRes] = await Promise.all([
        fetch(`${basePath}/api/custom-boards?subscribedOnly=false`),
        fetch(`${basePath}/api/custom-boards/cards?boardId=${boardId}`),
        fetch(`${basePath}/api/custom-boards/users`),
        fetch(`${basePath}/api/custom-boards/sprints?boardId=${boardId}`),
      ]);

      if (boardRes.ok) {
        const boardData = await boardRes.json();
        const found = boardData.boards?.find((b: any) => b._id === boardId);
        if (found) setBoard(found);
      }
      if (cardsRes.ok) {
        const cardsData = await cardsRes.json();
        setCards(cardsData.cards || []);
      }
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }
      if (sprintsRes.ok) {
        const sprintsData = await sprintsRes.json();
        setSprints(sprintsData.sprints || []);
      }
    } catch (err) {
      console.error("Error fetching board:", err);
      toast({ title: "Error", description: "Failed to load board", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [boardId, basePath, toast]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // ======================== Card Handlers ========================

  const handleCreateCard = async () => {
    if (!newCard.title.trim() || !createCardColumn) return;
    setIsCreating(true);

    try {
      const selectedUser = users.find((u) => u.id === newCard.assigneeId);
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          columnName: createCardColumn,
          title: newCard.title.trim(),
          description: newCard.description,
          assigneeId: newCard.assigneeId || undefined,
          assigneeName: selectedUser?.name,
          assigneeEmail: selectedUser?.email,
          priority: newCard.priority,
          dueDate: newCard.dueDate || undefined,
          labels: newCard.labels ? newCard.labels.split(",").map((l) => l.trim()).filter(Boolean) : [],
          sprintId: createCardSprintId || undefined,
          storyPoints: newCard.storyPoints !== "" && newCard.storyPoints !== undefined ? Number(newCard.storyPoints) : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create card");
      const data = await res.json();
      setCards((prev) => [...prev, data.card]);
      setIsCreateCardOpen(false);
      setNewCard({ title: "", description: "", assigneeId: "", priority: "MEDIUM", dueDate: "", labels: "", storyPoints: "" });
      toast({ title: "Card Created", description: "New card added successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create card", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateCard = async () => {
    if (!editingCard) return;
    setIsCreating(true);

    try {
      const selectedUser = users.find((u) => u.id === newCard.assigneeId);
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: editingCard._id,
          title: newCard.title.trim(),
          description: newCard.description,
          assigneeId: newCard.assigneeId || undefined,
          assigneeName: selectedUser?.name || undefined,
          assigneeEmail: selectedUser?.email || undefined,
          priority: newCard.priority,
          dueDate: newCard.dueDate || null,
          labels: newCard.labels ? newCard.labels.split(",").map((l) => l.trim()).filter(Boolean) : [],
          storyPoints: newCard.storyPoints !== "" && newCard.storyPoints !== undefined ? Number(newCard.storyPoints) : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to update card");
      await fetchBoard();
      setIsEditCardOpen(false);
      setEditingCard(null);
      toast({ title: "Card Updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update card", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards/cards?id=${cardId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete card");
      setCards((prev) => prev.filter((c) => c._id !== cardId));
      setIsCardDetailOpen(false);
      toast({ title: "Card Deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleInlineUpdate = async (cardId: string, updates: Record<string, any>) => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update card");
      setCards((prev) => prev.map((c) => (c._id === cardId ? { ...c, ...updates } : c)));
      setDetailCard((prev) => (prev && prev._id === cardId ? { ...prev, ...updates } : prev));
      toast({ title: "Updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAddDependency = async () => {
    if (!dependencySourceCard || !newDependency.targetCardId) return;
    try {
      const targetCard = cards.find((c) => c._id === newDependency.targetCardId);
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: dependencySourceCard._id,
          action: "addDependency",
          targetCardId: newDependency.targetCardId,
          targetCardTitle: targetCard?.title || "",
          type: newDependency.type,
        }),
      });
      if (!res.ok) throw new Error("Failed to add dependency");
      await fetchBoard();
      setIsDependencyDialogOpen(false);
      setNewDependency({ targetCardId: "", type: "depends_on" });
      toast({ title: "Dependency Added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveDependency = async (cardId: string, targetCardId: string, type: "depends_on" | "blocked_by") => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action: "removeDependency", targetCardId, type }),
      });
      if (!res.ok) throw new Error("Failed to remove dependency");
      await fetchBoard();
      toast({ title: "Dependency Removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ======================== Column Handlers ========================

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    try {
      const res = await fetch(`${basePath}/api/custom-boards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, action: "addColumn", columnName: newColumnName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add column");
      const data = await res.json();
      if (data.board) setBoard(data.board);
      else await fetchBoard();
      setIsAddColumnOpen(false);
      setNewColumnName("");
      toast({ title: "Column Added", description: `Added "${newColumnName.trim()}"` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteColumn = async (columnName: string) => {
    if (!board || board.columns.length <= 1) return;
    try {
      const res = await fetch(`${basePath}/api/custom-boards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, action: "removeColumn", columnName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete column");
      }
      const data = await res.json();
      if (data.board) setBoard(data.board);
      else await fetchBoard();
      toast({ title: "Column deleted", description: `"${columnName}" removed. Cards in it were moved to the first column.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ======================== Sprint Handlers ========================

  const handleCreateSprint = async () => {
    if (!newSprint.name.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, name: newSprint.name.trim(), goal: newSprint.goal }),
      });
      if (!res.ok) throw new Error("Failed to create sprint");
      const data = await res.json();
      setSprints((prev) => [data.sprint, ...prev]);
      setIsCreateSprintOpen(false);
      setNewSprint({ name: "", goal: "" });
      toast({ title: "Sprint Created", description: `"${data.sprint.name}" ready for planning` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartSprint = async () => {
    if (!startingSprintId || !startSprintForm.startDate || !startSprintForm.endDate) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintId: startingSprintId,
          action: "start",
          startDate: startSprintForm.startDate,
          endDate: startSprintForm.endDate,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to start sprint");
      }
      await fetchBoard();
      setIsStartSprintOpen(false);
      setStartingSprintId(null);
      setStartSprintForm({ startDate: "", endDate: "" });
      setActiveTab("board");
      toast({ title: "Sprint Started", description: "Sprint is now active" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCompleteSprint = async () => {
    if (!activeSprint) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: activeSprint._id, action: "complete", moveToBacklog: true }),
      });
      if (!res.ok) throw new Error("Failed to complete sprint");
      await fetchBoard();
      setIsCompleteSprintOpen(false);
      setActiveTab("backlog");
      toast({ title: "Sprint Completed", description: "Incomplete items moved to backlog" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints?id=${sprintId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete sprint");
      await fetchBoard();
      toast({ title: "Sprint Deleted", description: "Cards moved to backlog" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleMoveCardToSprint = async (cardIds: string[], sprintId: string | null) => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintId: activeSprint?._id || planningSprints[0]?._id || "dummy",
          action: "moveCards",
          cardIds,
          targetSprintId: sprintId,
        }),
      });
      if (!res.ok) throw new Error("Failed to move cards");
      setCards((prev) =>
        prev.map((c) => (cardIds.includes(c._id) ? { ...c, sprintId } : c))
      );
      toast({ title: "Cards Moved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ======================== Access Control ========================

  const handleToggleUserAccess = async (userId: string) => {
    if (!board) return;
    const currentAllowed = board.allowedUsers || [];
    const newAllowed = currentAllowed.includes(userId)
      ? currentAllowed.filter((id) => id !== userId)
      : [...currentAllowed, userId];

    setSavingAccess(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, action: "updateAccess", allowedUsers: newAllowed }),
      });
      if (!res.ok) throw new Error("Failed to update access");
      const data = await res.json();
      if (data.board) setBoard(data.board);
      else setBoard((prev) => (prev ? { ...prev, allowedUsers: newAllowed } : prev));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingAccess(false);
    }
  };

  const handleResetAccess = async () => {
    if (!board) return;
    setSavingAccess(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, action: "updateAccess", allowedUsers: [] }),
      });
      if (!res.ok) throw new Error("Failed to reset access");
      const data = await res.json();
      if (data.board) setBoard(data.board);
      else setBoard((prev) => (prev ? { ...prev, allowedUsers: [] } : prev));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingAccess(false);
    }
  };

  const openEditCard = (card: CardData) => {
    setEditingCard(card);
    setNewCard({
      title: card.title,
      description: card.description,
      assigneeId: card.assigneeId || "",
      priority: card.priority,
      dueDate: card.dueDate ? card.dueDate.split("T")[0] : "",
      labels: card.labels.join(", "),
      storyPoints: card.storyPoints ?? "",
    });
    setIsEditCardOpen(true);
  };

  const openCreateCard = (columnName: string, sprintId: string | null) => {
    setCreateCardColumn(columnName);
    setCreateCardSprintId(sprintId);
    setNewCard({ title: "", description: "", assigneeId: "", priority: "MEDIUM", dueDate: "", labels: "", storyPoints: "" });
    setIsCreateCardOpen(true);
  };

  // ======================== Loading & Error ========================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Board not found.</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`${basePath}/board`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  const incompleteActiveCards = activeSprint
    ? activeSprintCards.filter((c) => c.columnName !== board.columns[board.columns.length - 1]).length
    : 0;

  return (
    <div className="container mx-auto px-4 py-6">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => router.push(`${basePath}/board`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title={board.name}
            icon={<Columns3 className="h-5 w-5 text-white" />}
            gradient="from-violet-500 to-purple-500"
            description={`${cards.length} cards • ${sprints.filter((s) => s.status !== "completed").length} sprint(s)`}
          />

          {canManage && (
            <Popover open={isAccessPopoverOpen} onOpenChange={setIsAccessPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full gap-2 border-dashed",
                    board.allowedUsers?.length > 0
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                      : ""
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {!board.allowedUsers?.length ? "All Users" : `${board.allowedUsers.length} User${board.allowedUsers.length > 1 ? "s" : ""}`}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                      <Shield className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Board Access Control</p>
                      <p className="text-xs text-muted-foreground">Choose who can view this board</p>
                    </div>
                  </div>
                </div>
                <div className="p-2 border-b border-border/30">
                  <button
                    onClick={handleResetAccess}
                    disabled={savingAccess}
                    className={cn(
                      "flex items-center gap-3 w-full p-2 rounded-lg transition-all text-left",
                      !board.allowedUsers?.length ? "bg-emerald-500/10 border border-emerald-500/30" : "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-full", !board.allowedUsers?.length ? "bg-emerald-500/20" : "bg-muted")}>
                      <Users className={cn("h-4 w-4", !board.allowedUsers?.length ? "text-emerald-400" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1">
                      <p className={cn("text-sm font-medium", !board.allowedUsers?.length ? "text-emerald-400" : "")}>Everyone</p>
                      <p className="text-xs text-muted-foreground">All signed-up users can view</p>
                    </div>
                    {!board.allowedUsers?.length && <Check className="h-4 w-4 text-emerald-400" />}
                  </button>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <div className="p-2 space-y-0.5">
                    {users.filter((u) => u.role !== "ADMIN").map((u) => {
                      const isAllowed = board.allowedUsers?.includes(u.id) || false;
                      const isCreator = u.id === board.createdBy;
                      return (
                        <button
                          key={u.id}
                          onClick={() => !isCreator && handleToggleUserAccess(u.id)}
                          disabled={savingAccess || isCreator}
                          className={cn(
                            "flex items-center gap-3 w-full p-2 rounded-lg transition-all text-left",
                            isAllowed ? "bg-violet-500/10 border border-violet-500/20" : "hover:bg-muted/50",
                            isCreator && "opacity-60 cursor-default"
                          )}
                        >
                          <Avatar className="h-8 w-8 border border-border/50">
                            <AvatarImage src={u.image} />
                            <AvatarFallback className={cn("text-xs font-medium", isAllowed ? "bg-violet-500/20 text-violet-400" : "bg-muted")}>
                              {u.name?.charAt(0)?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                              {isCreator && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Owner</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <Checkbox checked={isAllowed || isCreator} disabled={isCreator} className="pointer-events-none" />
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* ==================== NAVIGATION TABS (Jira-style) ==================== */}
      <div className="mb-6">
        {/* Main Tab Bar */}
        <div className="border-b border-border/50 bg-gradient-to-r from-card/80 via-card/60 to-card/80 backdrop-blur-sm rounded-t-xl px-2">
          <div className="flex items-center justify-between">
            <nav className="flex items-center gap-1 -mb-px">
              {([
                { id: "backlog" as TabView, label: "Backlog", icon: Inbox, count: backlogCards.length, gradient: "from-amber-500 to-orange-500" },
                { id: "board" as TabView, label: "Board", icon: KanbanSquare, count: activeSprint ? activeSprintCards.length : cards.length, gradient: "from-blue-500 to-cyan-500" },
                { id: "list" as TabView, label: "List", icon: LayoutList, count: cards.length, gradient: "from-violet-500 to-purple-500" },
              ]).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium transition-all duration-300 rounded-t-lg group",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <div className={cn(
                      "p-1.5 rounded-md transition-all duration-300",
                      isActive
                        ? `bg-gradient-to-br ${tab.gradient} shadow-lg shadow-primary/20`
                        : "bg-muted/50 group-hover:bg-muted"
                    )}>
                      <tab.icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : "")} />
                    </div>
                    <span className="font-semibold">{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold transition-all",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                      )}>
                        {tab.count}
                      </span>
                    )}
                    {/* Active indicator line */}
                    {isActive && (
                      <div className={cn(
                        "absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full bg-gradient-to-r",
                        tab.gradient
                      )} />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right-side actions */}
            <div className="flex items-center gap-2 py-2">
              {activeTab === "board" && (
                <>
                  <Popover open={isBoardFilterOpen} onOpenChange={setIsBoardFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 text-xs rounded-lg border-border/50 gap-1.5",
                          hasActiveBoardFilters && "border-primary/50 bg-primary/10 text-primary"
                        )}
                      >
                        <Filter className="h-3.5 w-3.5" />
                        Filter
                        {hasActiveBoardFilters && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/20 text-[10px] font-bold">
                            {[boardFilterAssignee, boardFilterPriority, boardFilterLabel, boardFilterColumn].filter(Boolean).length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <Filter className="h-4 w-4 text-primary" /> Board filter
                          </span>
                          {hasActiveBoardFilters && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setBoardFilterAssignee(""); setBoardFilterPriority(""); setBoardFilterLabel(""); setBoardFilterColumn(""); }}>
                              Clear all
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="p-3 space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Assignee</Label>
                          <Select value={boardFilterAssignee || "all"} onValueChange={(v) => setBoardFilterAssignee(v === "all" ? "" : v)}>
                            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Priority</Label>
                          <Select value={boardFilterPriority || "all"} onValueChange={(v) => setBoardFilterPriority(v === "all" ? "" : v)}>
                            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status (column)</Label>
                          <Select value={boardFilterColumn || "all"} onValueChange={(v) => setBoardFilterColumn(v === "all" ? "" : v)}>
                            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {board?.columns.map((col) => (
                                <SelectItem key={col} value={col}>{col}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Label</Label>
                          <Select
                            value={boardFilterLabel || "all"}
                            onValueChange={(v) => setBoardFilterLabel(v === "all" ? "" : v)}
                          >
                            <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              {Array.from(new Set(cards.flatMap((c) => c.labels || []))).filter(Boolean).map((l) => (
                                <SelectItem key={l} value={l}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/30">
                    <Checkbox
                      id="dep-filter"
                      checked={showDependenciesOnly}
                      onCheckedChange={(c) => setShowDependenciesOnly(c === true)}
                    />
                    <Label htmlFor="dep-filter" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5" /> Dependency
                    </Label>
                  </div>
                  {canManage && activeSprint && cards.length > 0 && (
                    <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-border/50" onClick={() => setIsAddColumnOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Column
                    </Button>
                  )}
                  {canManage && activeSprint && (
                    <Button
                      size="sm"
                      className="h-8 text-xs rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-700 hover:to-green-700 shadow-sm"
                      onClick={() => setIsCompleteSprintOpen(true)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete Sprint
                    </Button>
                  )}
                </>
              )}
              {activeTab === "backlog" && canManage && (
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm"
                  onClick={() => setIsCreateSprintOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Sprint
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== TAB CONTENT ==================== */}
      {activeTab === "backlog" && (
        <BacklogView
          board={board}
          cards={cards}
          backlogCards={backlogCards}
          sprints={sprints}
          activeSprint={activeSprint}
          planningSprints={planningSprints}
          completedSprintsWithVelocity={completedSprintsWithVelocity}
          canManage={canManage}
          users={users}
          onCreateCard={openCreateCard}
          onCardClick={(card) => { setDetailCard(card); setIsCardDetailOpen(true); }}
          onMoveToSprint={handleMoveCardToSprint}
          onStartSprint={(sprintId) => {
            setStartingSprintId(sprintId);
            const today = new Date().toISOString().split("T")[0];
            const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            setStartSprintForm({ startDate: today, endDate: twoWeeks });
            setIsStartSprintOpen(true);
          }}
          onDeleteSprint={handleDeleteSprint}
        />
      )}

      {activeTab === "board" && (
        <>
          {!activeSprint && (
            <Alert className="mb-6 border-amber-500/30 bg-amber-500/5">
              <Inbox className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                No active sprint. Go to the <strong>Backlog</strong> tab to create a sprint and start it — then cards will appear here.
              </AlertDescription>
            </Alert>
          )}
          {activeSprint && burndownData.length > 0 && (
            <Card className="mb-6 border-border/50 bg-card/50 overflow-hidden">
              <CardContent className="p-4">
                <BurndownChart
                  title={`Sprint Burndown — ${activeSprint.name}`}
                  startDate={activeSprint.startDate ? new Date(activeSprint.startDate).toLocaleDateString() : undefined}
                  endDate={activeSprint.endDate ? new Date(activeSprint.endDate).toLocaleDateString() : undefined}
                  totalScope={activeSprintCards.reduce((s, c) => s + (c.storyPoints ?? 0), 0)}
                  data={burndownData}
                />
              </CardContent>
            </Card>
          )}
          {activeSprint && (
            <BoardView
              board={board}
              cards={boardFilteredCards}
              allCards={cards}
              activeSprint={activeSprint}
              canManage={canManage}
              showDependenciesOnly={showDependenciesOnly}
              basePath={basePath}
              boardId={boardId}
              onCreateCard={(col) => openCreateCard(col, activeSprint?._id || null)}
              onCardClick={(card) => { setDetailCard(card); setIsCardDetailOpen(true); }}
              onAddDependency={(card) => { setDependencySourceCard(card); setIsDependencyDialogOpen(true); }}
              onEditCard={openEditCard}
              onDeleteCard={handleDeleteCard}
              onDeleteColumn={handleDeleteColumn}
              fetchBoard={fetchBoard}
              setBoard={setBoard}
              toast={toast}
            />
          )}
        </>
      )}

      {activeTab === "list" && (
        <ListView
          board={board}
          cards={cards}
          sprints={sprints}
          activeSprint={activeSprint}
          users={users}
          basePath={basePath}
          fetchBoard={fetchBoard}
          onCardClick={(card) => { setDetailCard(card); setIsCardDetailOpen(true); }}
          onEditCard={openEditCard}
          onDeleteCard={handleDeleteCard}
        />
      )}

      {/* ==================== DIALOGS ==================== */}

      {/* Create Card Dialog */}
      <Dialog open={isCreateCardOpen} onOpenChange={setIsCreateCardOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Create New Card
            </DialogTitle>
            <DialogDescription>
              Add a new card to <Badge variant="secondary">{createCardColumn}</Badge>
              {createCardSprintId && (
                <span className="ml-1">
                  in <Badge variant="outline">{sprints.find((s) => s._id === createCardSprintId)?.name || "Sprint"}</Badge>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <CardForm card={newCard} setCard={setNewCard} users={users} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCardOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateCard}
              disabled={!newCard.title.trim() || isCreating}
              className="bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Card Dialog */}
      <Dialog open={isEditCardOpen} onOpenChange={setIsEditCardOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" /> Edit Card
            </DialogTitle>
          </DialogHeader>
          <CardForm card={newCard} setCard={setNewCard} users={users} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCardOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCard} disabled={!newCard.title.trim() || isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Detail Dialog */}
      <Dialog open={isCardDetailOpen} onOpenChange={setIsCardDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          {detailCard && (
            <CardDetailView
              card={detailCard}
              cards={cards}
              users={users}
              sprints={sprints}
              basePath={basePath}
              board={board}
              onEdit={() => { setIsCardDetailOpen(false); openEditCard(detailCard); }}
              onDelete={() => handleDeleteCard(detailCard._id)}
              onAddDependency={() => {
                setDependencySourceCard(detailCard);
                setIsCardDetailOpen(false);
                setIsDependencyDialogOpen(true);
              }}
              onRemoveDependency={handleRemoveDependency}
              onInlineUpdate={handleInlineUpdate}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Dependency Dialog */}
      <Dialog open={isDependencyDialogOpen} onOpenChange={setIsDependencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" /> Add Dependency
            </DialogTitle>
            <DialogDescription>Link &quot;{dependencySourceCard?.title}&quot; to another card</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dependency Type</Label>
              <Select value={newDependency.type} onValueChange={(v: "depends_on" | "blocked_by") => setNewDependency({ ...newDependency, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="depends_on">This card depends on...</SelectItem>
                  <SelectItem value="blocked_by">This card is blocked by...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Card</Label>
              <Select value={newDependency.targetCardId} onValueChange={(v) => setNewDependency({ ...newDependency, targetCardId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a card" /></SelectTrigger>
                <SelectContent>
                  {cards.filter((c) => c._id !== dependencySourceCard?._id).map((card) => (
                    <SelectItem key={card._id} value={card._id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{card.columnName}</Badge>
                        <span className="truncate max-w-[200px]">{card.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDependencyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDependency} disabled={!newDependency.targetCardId}>
              <Link2 className="h-4 w-4 mr-2" /> Add Dependency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Columns3 className="h-5 w-5 text-primary" /> Add New Column</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Column Name</Label>
            <Input value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="e.g., Code Review" className="mt-1" onKeyDown={(e) => e.key === "Enter" && handleAddColumn()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddColumnOpen(false)}>Cancel</Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim()}>
              <Plus className="h-4 w-4 mr-2" /> Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Sprint Dialog */}
      <Dialog open={isCreateSprintOpen} onOpenChange={setIsCreateSprintOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Create Sprint</DialogTitle>
            <DialogDescription>Create a new sprint to organize your work</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sprint Name *</Label>
              <Input value={newSprint.name} onChange={(e) => setNewSprint({ ...newSprint, name: e.target.value })} placeholder="Sprint 1" className="mt-1" />
            </div>
            <div>
              <Label>Sprint Goal</Label>
              <Textarea value={newSprint.goal} onChange={(e) => setNewSprint({ ...newSprint, goal: e.target.value })} placeholder="What do you want to achieve?" className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateSprintOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSprint} disabled={!newSprint.name.trim() || isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Sprint Dialog */}
      <Dialog open={isStartSprintOpen} onOpenChange={setIsStartSprintOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Play className="h-5 w-5 text-emerald-500" /> Start Sprint</DialogTitle>
            <DialogDescription>
              {sprints.find((s) => s._id === startingSprintId)?.name}
              {" — "}
              {cards.filter((c) => c.sprintId === startingSprintId).length} cards
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startSprintForm.startDate} onChange={(e) => setStartSprintForm({ ...startSprintForm, startDate: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={startSprintForm.endDate} onChange={(e) => setStartSprintForm({ ...startSprintForm, endDate: e.target.value })} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStartSprintOpen(false)}>Cancel</Button>
            <Button onClick={handleStartSprint} disabled={!startSprintForm.startDate || !startSprintForm.endDate || isCreating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start Sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Sprint Dialog */}
      <Dialog open={isCompleteSprintOpen} onOpenChange={setIsCompleteSprintOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Complete Sprint</DialogTitle>
            <DialogDescription>
              Complete &quot;{activeSprint?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Total cards</span>
              <span className="font-medium">{activeSprintCards.length}</span>
            </div>
            {(activeSprintCards.reduce((s, c) => s + (c.storyPoints ?? 0), 0)) > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <span className="text-cyan-400">Total story points</span>
                <span className="font-medium text-cyan-400">{activeSprintCards.reduce((s, c) => s + (c.storyPoints ?? 0), 0)}</span>
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-emerald-400">Completed</span>
              <span className="font-medium text-emerald-400">{activeSprintCards.length - incompleteActiveCards}</span>
            </div>
            {incompleteActiveCards > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-amber-400">Incomplete (move to backlog)</span>
                <span className="font-medium text-amber-400">{incompleteActiveCards}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteSprintOpen(false)}>Cancel</Button>
            <Button onClick={handleCompleteSprint} disabled={isCreating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Complete Sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================================================================
// BACKLOG VIEW
// ================================================================
function BacklogView({
  board,
  cards,
  backlogCards,
  sprints,
  activeSprint,
  planningSprints,
  completedSprintsWithVelocity,
  canManage,
  users,
  onCreateCard,
  onCardClick,
  onMoveToSprint,
  onStartSprint,
  onDeleteSprint,
}: {
  board: BoardData;
  cards: CardData[];
  backlogCards: CardData[];
  sprints: SprintData[];
  activeSprint: SprintData | null;
  planningSprints: SprintData[];
  completedSprintsWithVelocity: Array<SprintData & { velocity: number }>;
  canManage: boolean;
  users: TenantUser[];
  onCreateCard: (columnName: string, sprintId: string | null) => void;
  onCardClick: (card: CardData) => void;
  onMoveToSprint: (cardIds: string[], sprintId: string | null) => void;
  onStartSprint: (sprintId: string) => void;
  onDeleteSprint: (sprintId: string) => void;
}) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set(
    planningSprints.map(s => s._id)
  ));

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleSprintExpand = (sprintId: string) => {
    setExpandedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId);
      else next.add(sprintId);
      return next;
    });
  };

  const sprintCards = (sprintId: string) => cards.filter((c) => c.sprintId === sprintId);

  const clearSelectionForIds = useCallback((ids: string[]) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const getOtherDestinations = useCallback((currentSprintId: string) => {
    const dests: Array<{ id: string | null; name: string }> = [{ id: null, name: "Backlog" }];
    if (activeSprint && activeSprint._id !== currentSprintId) dests.push({ id: activeSprint._id, name: `${activeSprint.name} (Active)` });
    planningSprints.filter((s) => s._id !== currentSprintId).forEach((s) => dests.push({ id: s._id, name: s.name }));
    return dests;
  }, [activeSprint, planningSprints]);

  return (
    <div className="space-y-4">
      {/* Velocity (completed sprints) */}
      {completedSprintsWithVelocity.length > 0 && (
        <Card className="border-border/50 bg-card/50 overflow-hidden">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              Velocity (last 5 completed sprints)
            </h3>
            <div className="flex flex-wrap gap-3">
              {completedSprintsWithVelocity.map((s) => (
                <div key={s._id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/30">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="secondary" className="text-cyan-400 bg-cyan-500/10 border-cyan-500/30">{s.velocity} pts</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Sprint */}
      {activeSprint && (
        <SprintSection
          sprint={activeSprint}
          cards={sprintCards(activeSprint._id)}
          isExpanded={expandedSprints.has(activeSprint._id)}
          onToggle={() => toggleSprintExpand(activeSprint._id)}
          onCardClick={onCardClick}
          selectedCards={selectedCards}
          onToggleCard={toggleCardSelection}
          canManage={canManage}
          statusColor="emerald"
          board={board}
          onMoveToSprint={onMoveToSprint}
          otherDestinations={getOtherDestinations(activeSprint._id)}
          onClearSelection={clearSelectionForIds}
        />
      )}

      {/* Planning Sprints */}
      {planningSprints.map((sprint) => (
        <SprintSection
          key={sprint._id}
          sprint={sprint}
          cards={sprintCards(sprint._id)}
          isExpanded={expandedSprints.has(sprint._id)}
          onToggle={() => toggleSprintExpand(sprint._id)}
          onCardClick={onCardClick}
          selectedCards={selectedCards}
          onToggleCard={toggleCardSelection}
          canManage={canManage}
          statusColor="blue"
          board={board}
          onStartSprint={() => onStartSprint(sprint._id)}
          onDeleteSprint={() => onDeleteSprint(sprint._id)}
          onCreateCard={() => onCreateCard(board.columns[0], sprint._id)}
          onMoveToSprint={onMoveToSprint}
          otherDestinations={getOtherDestinations(sprint._id)}
          onClearSelection={clearSelectionForIds}
        />
      ))}

      {/* Backlog */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <Inbox className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Backlog</h3>
                <p className="text-xs text-muted-foreground">
                  {backlogCards.length} items
                  {(backlogCards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)) > 0 && (
                    <span className="text-cyan-400 ml-1">• {backlogCards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)} pts</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedCards.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full">
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Move {selectedCards.size} to Sprint
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {activeSprint && (
                      <DropdownMenuItem onClick={() => { onMoveToSprint(Array.from(selectedCards), activeSprint._id); setSelectedCards(new Set()); }}>
                        <Play className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                        {activeSprint.name} (Active)
                      </DropdownMenuItem>
                    )}
                    {planningSprints.map((s) => (
                      <DropdownMenuItem key={s._id} onClick={() => { onMoveToSprint(Array.from(selectedCards), s._id); setSelectedCards(new Set()); }}>
                        <Target className="h-3.5 w-3.5 mr-2 text-blue-400" />
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button variant="ghost" size="sm" onClick={() => onCreateCard(board.columns[0], null)}>
                <Plus className="h-4 w-4 mr-1" /> Create Issue
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border/30">
            {backlogCards.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Your backlog is empty</p>
                <p className="text-xs mt-1">Create issues to plan your work</p>
              </div>
            ) : (
              backlogCards.map((card) => (
                <BacklogCardRow
                  key={card._id}
                  card={card}
                  isSelected={selectedCards.has(card._id)}
                  onToggle={() => toggleCardSelection(card._id)}
                  onClick={() => onCardClick(card)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Sprint Section in Backlog
function SprintSection({
  sprint,
  cards,
  isExpanded,
  onToggle,
  onCardClick,
  selectedCards,
  onToggleCard,
  canManage,
  statusColor,
  board,
  onStartSprint,
  onDeleteSprint,
  onCreateCard,
  onMoveToSprint,
  otherDestinations,
  onClearSelection,
}: {
  sprint: SprintData;
  cards: CardData[];
  isExpanded: boolean;
  onToggle: () => void;
  onCardClick: (card: CardData) => void;
  selectedCards: Set<string>;
  onToggleCard: (cardId: string) => void;
  canManage: boolean;
  statusColor: string;
  board: BoardData;
  onStartSprint?: () => void;
  onDeleteSprint?: () => void;
  onCreateCard?: () => void;
  onMoveToSprint?: (cardIds: string[], sprintId: string | null) => void;
  otherDestinations?: Array<{ id: string | null; name: string }>;
  onClearSelection?: (ids: string[]) => void;
}) {
  const isActive = sprint.status === "active";
  const daysLeft = sprint.endDate
    ? Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const selectedInThisSprint = useMemo(
    () => cards.filter((c) => selectedCards.has(c._id)).map((c) => c._id),
    [cards, selectedCards]
  );
  const showMoveToSprint = canManage && onMoveToSprint && otherDestinations && otherDestinations.length > 0 && selectedInThisSprint.length > 0;

  return (
    <Card className={cn(
      "border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden",
      isActive && "border-emerald-500/30"
    )}>
      <CardContent className="p-0">
        <div
          className={cn(
            "flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors",
            isActive ? "bg-emerald-500/5" : "bg-blue-500/5"
          )}
          onClick={onToggle}
        >
          <div className="flex items-center gap-3">
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
            <div className={cn("p-2 rounded-lg", isActive ? "bg-emerald-500/10" : "bg-blue-500/10")}>
              {isActive ? <Play className="h-4 w-4 text-emerald-400" /> : <Target className="h-4 w-4 text-blue-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{sprint.name}</h3>
                <Badge variant="outline" className={cn("text-[10px]", isActive ? "border-emerald-500/30 text-emerald-400" : "border-blue-500/30 text-blue-400")}>
                  {isActive ? "Active" : "Planning"}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">{cards.length} items</Badge>
                {(cards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)) > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                    {cards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0)} pts
                  </Badge>
                )}
              </div>
              {sprint.goal && <p className="text-xs text-muted-foreground mt-0.5">{sprint.goal}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {showMoveToSprint && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="text-violet-400 border-violet-500/30 hover:bg-violet-500/10">
                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                    Move {selectedInThisSprint.length} to sprint
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {otherDestinations!.map((dest) => (
                    <DropdownMenuItem
                      key={dest.id ?? "backlog"}
                      onClick={() => {
                        onMoveToSprint!(selectedInThisSprint, dest.id);
                        onClearSelection?.(selectedInThisSprint);
                      }}
                    >
                      {dest.id === null ? (
                        <Inbox className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      ) : (
                        <Target className="h-3.5 w-3.5 mr-2 text-blue-400" />
                      )}
                      {dest.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isActive && daysLeft !== null && (
              <Badge variant={daysLeft < 0 ? "destructive" : daysLeft <= 3 ? "outline" : "secondary"} className="text-xs">
                <Timer className="h-3 w-3 mr-1" />
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
              </Badge>
            )}
            {!isActive && canManage && onStartSprint && (
              <Button size="sm" variant="outline" className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10" onClick={onStartSprint}>
                <Play className="h-3.5 w-3.5 mr-1" /> Start Sprint
              </Button>
            )}
            {!isActive && canManage && onDeleteSprint && (
              <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={onDeleteSprint}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onCreateCard && (
              <Button size="sm" variant="ghost" onClick={onCreateCard}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="divide-y divide-border/30">
            {cards.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No items in this sprint yet. Drag items from the backlog or create new ones.
              </div>
            ) : (
              cards.map((card) => (
                <BacklogCardRow
                  key={card._id}
                  card={card}
                  isSelected={selectedCards.has(card._id)}
                  onToggle={() => onToggleCard(card._id)}
                  onClick={() => onCardClick(card)}
                />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Backlog Card Row
function BacklogCardRow({
  card,
  isSelected,
  onToggle,
  onClick,
}: {
  card: CardData;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const prioCfg = PRIORITY_CONFIG[card.priority];
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const hasDeps = card.dependencies?.length > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group",
        isSelected && "bg-primary/5"
      )}
      onClick={onClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", prioCfg.dot)} title={prioCfg.label} />
      <p className="text-sm font-medium flex-1 truncate">{card.title}</p>
      {card.storyPoints != null && (
        <Badge variant="outline" className="text-[10px] shrink-0 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
          {card.storyPoints} pt{card.storyPoints !== 1 ? "s" : ""}
        </Badge>
      )}
      {hasDeps && (
        <div className="flex items-center gap-1 text-xs text-blue-400">
          <Link2 className="h-3 w-3" />
        </div>
      )}
      {card.labels.length > 0 && (
        <div className="flex gap-1">
          {card.labels.slice(0, 2).map((l, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{l}</Badge>
          ))}
        </div>
      )}
      <Badge className={cn("text-[10px] border shrink-0", prioCfg.color)}>{prioCfg.label}</Badge>
      {card.dueDate && (
        <span className={cn("text-xs shrink-0", isOverdue ? "text-red-400" : "text-muted-foreground")}>
          {new Date(card.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      )}
      {card.assigneeName && (
        <Avatar className="h-6 w-6 shrink-0 border border-border/50">
          <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white text-[10px]">
            {card.assigneeName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// ================================================================
// BOARD VIEW (Kanban)
// ================================================================
function BoardView({
  board,
  cards,
  allCards,
  activeSprint,
  canManage,
  showDependenciesOnly,
  basePath,
  boardId,
  onCreateCard,
  onCardClick,
  onAddDependency,
  onEditCard,
  onDeleteCard,
  onDeleteColumn,
  fetchBoard,
  setBoard,
  toast,
}: {
  board: BoardData;
  cards: CardData[];
  allCards: CardData[];
  activeSprint: SprintData | null;
  canManage: boolean;
  showDependenciesOnly: boolean;
  basePath: string;
  boardId: string;
  onCreateCard: (col: string) => void;
  onCardClick: (card: CardData) => void;
  onAddDependency: (card: CardData) => void;
  onEditCard: (card: CardData) => void;
  onDeleteCard: (cardId: string) => void;
  onDeleteColumn: (columnName: string) => void;
  fetchBoard: () => Promise<void>;
  setBoard: React.Dispatch<React.SetStateAction<BoardData | null>>;
  toast: any;
}) {
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isDraggingColumn, setIsDraggingColumn] = useState(false);
  const [backwardMoveModal, setBackwardMoveModal] = useState<{ cardId: string; targetColumn: string } | null>(null);
  const [backwardMoveReason, setBackwardMoveReason] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const groupedCards = useMemo(() => {
    const groups: Record<string, CardData[]> = {};
    board.columns.forEach((col) => { groups[col] = []; });

    const filtered = showDependenciesOnly
      ? cards.filter((c) => c.dependencies?.length > 0)
      : cards;

    filtered.forEach((card) => {
      if (groups[card.columnName]) groups[card.columnName].push(card);
      else groups[card.columnName] = [card];
    });
    Object.keys(groups).forEach((col) => { groups[col].sort((a, b) => a.order - b.order); });
    return groups;
  }, [cards, board, showDependenciesOnly]);

  const columnIds = useMemo(() => board.columns.map((col) => `column::${col}`), [board]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string;
    if (activeId.startsWith("column::")) {
      setActiveColumn(activeId.replace("column::", ""));
      setActiveCard(null);
      setIsDraggingColumn(true);
    } else {
      const card = cards.find((c) => c._id === activeId);
      setActiveCard(card || null);
      setActiveColumn(null);
      setIsDraggingColumn(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    setActiveColumn(null);
    setIsDraggingColumn(false);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith("column::")) {
      const fromCol = activeId.replace("column::", "");
      let toCol: string | null = null;
      if (overId.startsWith("column::")) toCol = overId.replace("column::", "");
      else if (over.data.current?.type === "column") toCol = over.data.current.columnName;
      if (!toCol || fromCol === toCol) return;

      const oldIndex = board.columns.indexOf(fromCol);
      const newIndex = board.columns.indexOf(toCol);
      if (oldIndex === -1 || newIndex === -1) return;

      const newColumns = arrayMove(board.columns, oldIndex, newIndex);
      setBoard((prev) => (prev ? { ...prev, columns: newColumns } : prev));

      try {
        const res = await fetch(`${basePath}/api/custom-boards`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boardId, action: "reorderColumns", columns: newColumns }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "Column Moved" });
      } catch {
        fetchBoard();
        toast({ title: "Error", description: "Failed to reorder columns", variant: "destructive" });
      }
      return;
    }

    const card = cards.find((c) => c._id === activeId);
    if (!card) return;

    let targetColumn: string;
    if (overId.startsWith("column::")) targetColumn = overId.replace("column::", "");
    else if (overId.startsWith("card-drop::")) targetColumn = overId.replace("card-drop::", "");
    else if (over.data.current?.type === "column") targetColumn = over.data.current.columnName || overId;
    else {
      const overCard = cards.find((c) => c._id === overId);
      targetColumn = overCard ? overCard.columnName : overId;
    }

    if (card.columnName === targetColumn) return;

    const fromIdx = board.columns.indexOf(card.columnName);
    const toIdx = board.columns.indexOf(targetColumn);
    const isBackwardMove = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;

    if (isBackwardMove) {
      setBackwardMoveModal({ cardId: activeId, targetColumn });
      setBackwardMoveReason("");
      return;
    }

    try {
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: activeId, action: "move", targetColumn }),
      });
      if (!res.ok) throw new Error();
      await fetchBoard();
      toast({ title: "Card Moved", description: `Moved to ${targetColumn}` });
    } catch {
      toast({ title: "Error", description: "Failed to move card", variant: "destructive" });
    }
  };

  const confirmBackwardMove = async () => {
    if (!backwardMoveModal) return;
    try {
      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: backwardMoveModal.cardId,
          action: "move",
          targetColumn: backwardMoveModal.targetColumn,
          backwardReason: backwardMoveReason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      await fetchBoard();
      setBackwardMoveModal(null);
      setBackwardMoveReason("");
      toast({ title: "Card Moved", description: `Moved backward to ${backwardMoveModal.targetColumn}` });
    } catch {
      toast({ title: "Error", description: "Failed to move card", variant: "destructive" });
    }
  };

  return (
    <div>
      {activeSprint && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <Play className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-400">{activeSprint.name}</span>
          {activeSprint.goal && <span className="text-xs text-muted-foreground">— {activeSprint.goal}</span>}
          {activeSprint.endDate && (
            <Badge variant="secondary" className="text-xs ml-auto">
              <Timer className="h-3 w-3 mr-1" />
              {Math.ceil((new Date(activeSprint.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d left
            </Badge>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={isDraggingColumn ? rectIntersection : closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {board.columns.map((column, colIdx) => (
              <SortableColumn
                key={column}
                columnName={column}
                columnId={`column::${column}`}
                cards={groupedCards[column] || []}
                colIndex={colIdx}
                isDraggingColumn={isDraggingColumn}
                onAddCard={() => onCreateCard(column)}
                onCardClick={onCardClick}
                onAddDependency={onAddDependency}
                onEditCard={onEditCard}
                onDeleteCard={onDeleteCard}
                onDeleteColumn={onDeleteColumn}
                canDeleteColumn={canManage && board.columns.length > 1}
              />
            ))}
            {canManage && cards.length > 0 && (
              <div
                className="flex-shrink-0 w-80 border-2 border-dashed border-border/50 rounded-xl flex items-center justify-center min-h-[200px] cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                onClick={() => {}}
              >
                <div className="text-center">
                  <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">Add Column</p>
                </div>
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard && (
            <CustomTaskCard card={activeCard} colIndex={0} onClick={() => {}} onAddDependency={() => {}} onEdit={() => {}} onDelete={() => {}} isDragging />
          )}
          {activeColumn && board && (
            <ColumnDragOverlay columnName={activeColumn} cardCount={groupedCards[activeColumn]?.length || 0} colIndex={board.columns.indexOf(activeColumn)} />
          )}
        </DragOverlay>
      </DndContext>

      {/* Backward move reason modal */}
      <Dialog open={!!backwardMoveModal} onOpenChange={(open) => { if (!open) setBackwardMoveModal(null); setBackwardMoveReason(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" /> Moving card backward
            </DialogTitle>
            <DialogDescription>
              You are moving this card to an earlier column. Please provide a reason (optional but recommended for history).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="backward-reason">Reason</Label>
            <Textarea
              id="backward-reason"
              placeholder="e.g. Blocked by dependency, requirements changed, re-prioritized..."
              value={backwardMoveReason}
              onChange={(e) => setBackwardMoveReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBackwardMoveModal(null); setBackwardMoveReason(""); }}>
              Cancel
            </Button>
            <Button onClick={confirmBackwardMove} className="bg-amber-600 hover:bg-amber-700">
              Confirm move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================================================================
// LIST VIEW
// ================================================================
function ListView({
  board,
  cards,
  sprints,
  activeSprint,
  users,
  basePath,
  fetchBoard,
  onCardClick,
  onEditCard,
  onDeleteCard,
}: {
  board: BoardData;
  cards: CardData[];
  sprints: SprintData[];
  activeSprint: SprintData | null;
  users: TenantUser[];
  basePath: string;
  fetchBoard: () => Promise<void>;
  onCardClick: (card: CardData) => void;
  onEditCard: (card: CardData) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  const [sortField, setSortField] = useState<"title" | "priority" | "status" | "assignee" | "dueDate" | "created" | "storyPoints">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterSprint, setFilterSprint] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const { toast } = useToast();

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const filteredCards = useMemo(() => {
    let filtered = [...cards];
    if (filterSprint === "backlog") filtered = filtered.filter((c) => !c.sprintId);
    else if (filterSprint === "active" && activeSprint) filtered = filtered.filter((c) => c.sprintId === activeSprint._id);
    else if (filterSprint !== "all") filtered = filtered.filter((c) => c.sprintId === filterSprint);

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "priority": cmp = (PRIORITY_CONFIG[a.priority]?.sortOrder ?? 9) - (PRIORITY_CONFIG[b.priority]?.sortOrder ?? 9); break;
        case "status": cmp = board.columns.indexOf(a.columnName) - board.columns.indexOf(b.columnName); break;
        case "assignee": cmp = (a.assigneeName || "zzz").localeCompare(b.assigneeName || "zzz"); break;
        case "dueDate": cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999"); break;
        case "created": cmp = a.createdAt.localeCompare(b.createdAt); break;
        case "storyPoints": cmp = (a.storyPoints ?? 0) - (b.storyPoints ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [cards, sortField, sortDir, filterSprint, activeSprint, board]);

  const toggleSelect = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredCards.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCards.map((c) => c._id)));
  };

  const handleBulkUpdate = async (updates: { assigneeId?: string; assigneeName?: string; assigneeEmail?: string; priority?: CardData["priority"]; columnName?: string; sprintId?: string | null; storyPoints?: number }) => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const payload: any = { action: "bulkUpdate", cardIds: Array.from(selectedIds), updates: {} };
      if (updates.assigneeId !== undefined) {
        payload.updates.assigneeId = updates.assigneeId;
        const u = users.find((x) => x.id === updates.assigneeId);
        if (u) { payload.updates.assigneeName = u.name; payload.updates.assigneeEmail = u.email; }
      }
      if (updates.priority !== undefined) payload.updates.priority = updates.priority;
      if (updates.columnName !== undefined) payload.updates.columnName = updates.columnName;
      if (updates.sprintId !== undefined) payload.updates.sprintId = updates.sprintId;
      if (updates.storyPoints !== undefined) payload.updates.storyPoints = updates.storyPoints;

      const res = await fetch(`${basePath}/api/custom-boards/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Bulk update failed");
      await fetchBoard();
      setSelectedIds(new Set());
      toast({ title: "Updated", description: `${selectedIds.size} item(s) updated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Bulk update failed", variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
      {label}
      {sortField === field && (sortDir === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={filterSprint} onValueChange={setFilterSprint}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by sprint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="backlog">Backlog</SelectItem>
            {activeSprint && <SelectItem value="active">Active Sprint</SelectItem>}
            {sprints.filter((s) => s.status !== "completed").map((s) => (
              <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filteredCards.length} items</span>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={bulkSaving}>{bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Bulk edit"}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => handleBulkUpdate({ columnName: board.columns[0] })}>Set Status → {board.columns[0]}</DropdownMenuItem>
                {board.columns.slice(1).map((col) => (
                  <DropdownMenuItem key={col} onClick={() => handleBulkUpdate({ columnName: col })}>Set Status → {col}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleBulkUpdate({ priority: "CRITICAL" })}>Set Priority → Critical</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkUpdate({ priority: "HIGH" })}>Set Priority → High</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkUpdate({ priority: "MEDIUM" })}>Set Priority → Medium</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkUpdate({ priority: "LOW" })}>Set Priority → Low</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleBulkUpdate({ sprintId: null })}>Move to Backlog</DropdownMenuItem>
                {activeSprint && <DropdownMenuItem onClick={() => handleBulkUpdate({ sprintId: activeSprint._id })}>Add to Active Sprint</DropdownMenuItem>}
                {sprints.filter((s) => s.status === "planning").map((s) => (
                  <DropdownMenuItem key={s._id} onClick={() => handleBulkUpdate({ sprintId: s._id })}>Add to {s.name}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {users.map((u) => (
                  <DropdownMenuItem key={u.id} onClick={() => handleBulkUpdate({ assigneeId: u.id, assigneeName: u.name, assigneeEmail: u.email })}>Assign → {u.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      <Card className="border-border/50 bg-card/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="w-10 px-2 py-3">
                  <Checkbox checked={filteredCards.length > 0 && selectedIds.size === filteredCards.length} onCheckedChange={selectAll} />
                </th>
                <th className="px-4 py-3 text-left"><SortHeader field="title" label="Title" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="status" label="Status" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="priority" label="Priority" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="storyPoints" label="Points" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="assignee" label="Assignee" /></th>
                <th className="px-4 py-3 text-left"><SortHeader field="dueDate" label="Due Date" /></th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Sprint</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredCards.map((card) => {
                const prioCfg = PRIORITY_CONFIG[card.priority];
                const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
                const sprintName = card.sprintId
                  ? sprints.find((s) => s._id === card.sprintId)?.name || "Sprint"
                  : "Backlog";
                const colIdx = board.columns.indexOf(card.columnName);

                return (
                  <tr
                    key={card._id}
                    className={cn("hover:bg-muted/20 transition-colors cursor-pointer", selectedIds.has(card._id) && "bg-primary/5")}
                    onClick={() => onCardClick(card)}
                  >
                    <td className="w-10 px-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(card._id)} onCheckedChange={() => toggleSelect(card._id)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {card.dependencies?.length > 0 && <Link2 className="h-3 w-3 text-blue-400 shrink-0" />}
                        <span className="text-sm font-medium truncate max-w-[300px]">{card.title}</span>
                        {card.labels.length > 0 && (
                          <div className="flex gap-1">
                            {card.labels.slice(0, 2).map((l, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">{l}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("text-xs", COLUMN_ACCENT_COLORS[colIdx >= 0 ? colIdx % COLUMN_ACCENT_COLORS.length : 0].replace("border-", "text-"))}>
                        {card.columnName}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-[10px] border", prioCfg.color)}>
                        <div className={cn("w-1.5 h-1.5 rounded-full mr-1", prioCfg.dot)} />
                        {prioCfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {card.storyPoints != null ? (
                        <span className="text-sm text-cyan-400">{card.storyPoints}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {card.assigneeName ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white text-[10px]">
                              {card.assigneeName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{card.assigneeName}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {card.dueDate ? (
                        <span className={cn("text-sm", isOverdue ? "text-red-400" : "text-muted-foreground")}>
                          {new Date(card.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {isOverdue && <AlertTriangle className="h-3 w-3 inline ml-1 text-red-500" />}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-[10px]">{sprintName}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditCard(card)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-500" onClick={() => onDeleteCard(card._id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ================================================================
// Card Form (Create/Edit)
// ================================================================
function CardForm({
  card,
  setCard,
  users,
}: {
  card: { title: string; description: string; assigneeId: string; priority: CardData["priority"]; dueDate: string; labels: string; storyPoints: string | number };
  setCard: (card: any) => void;
  users: TenantUser[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })} placeholder="Card title" className="mt-1" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={card.description} onChange={(e) => setCard({ ...card, description: e.target.value })} placeholder="Add a description..." className="mt-1" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Story Points</Label>
          <Input type="number" min={0} step={0.5} value={card.storyPoints === "" ? "" : card.storyPoints} onChange={(e) => setCard({ ...card, storyPoints: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="e.g. 3" className="mt-1" />
        </div>
        <div>
          <Label>Assignee</Label>
          <Select value={card.assigneeId || "unassigned"} onValueChange={(v) => setCard({ ...card, assigneeId: v === "unassigned" ? "" : v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned"><span className="text-muted-foreground">Unassigned</span></SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  <div className="flex items-center gap-2">
                    <span>{u.name}</span>
                    <span className="text-xs text-muted-foreground">({u.role})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={card.priority} onValueChange={(v) => setCard({ ...card, priority: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={card.dueDate} onChange={(e) => setCard({ ...card, dueDate: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>Labels (comma-separated)</Label>
          <Input value={card.labels} onChange={(e) => setCard({ ...card, labels: e.target.value })} placeholder="bug, feature, ..." className="mt-1" />
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Card Detail View (with inline editing)
// ================================================================
interface ActivityData {
  _id: string;
  cardId: string;
  boardId: string;
  type: string;
  userId: string;
  userName: string;
  fromValue?: string;
  toValue?: string;
  metadata?: Record<string, any>;
  isBackwardMove?: boolean;
  createdAt: string;
}

const ACTIVITY_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  created: { icon: Plus, label: "created this card", color: "text-emerald-400" },
  moved: { icon: ArrowUpRight, label: "changed the Status", color: "text-blue-400" },
  moved_backward: { icon: ArrowDownLeft, label: "moved backward", color: "text-red-400" },
  assigned: { icon: UserPlus, label: "changed the Assignee", color: "text-violet-400" },
  unassigned: { icon: UserPlus, label: "removed the Assignee", color: "text-gray-400" },
  priority_changed: { icon: Zap, label: "changed the Priority", color: "text-orange-400" },
  title_changed: { icon: Edit3, label: "updated the Title", color: "text-blue-400" },
  description_changed: { icon: Edit3, label: "updated the Description", color: "text-blue-400" },
  due_date_changed: { icon: Calendar, label: "changed the Due Date", color: "text-amber-400" },
  story_points_changed: { icon: Target, label: "changed Story Points", color: "text-cyan-400" },
  labels_changed: { icon: Tag, label: "updated Labels", color: "text-cyan-400" },
  dependency_added: { icon: Link2, label: "added a Dependency", color: "text-blue-400" },
  dependency_removed: { icon: Link2, label: "removed a Dependency", color: "text-gray-400" },
  sprint_changed: { icon: Target, label: "changed the Sprint", color: "text-violet-400" },
  deleted: { icon: Trash2, label: "deleted this card", color: "text-red-400" },
};

function CardDetailView({
  card,
  cards,
  users,
  sprints,
  basePath,
  board,
  onEdit,
  onDelete,
  onAddDependency,
  onRemoveDependency,
  onInlineUpdate,
}: {
  card: CardData;
  cards: CardData[];
  users: TenantUser[];
  sprints: SprintData[];
  basePath: string;
  board: BoardData;
  onEdit: () => void;
  onDelete: () => void;
  onAddDependency: () => void;
  onRemoveDependency: (cardId: string, targetCardId: string, type: "depends_on" | "blocked_by") => void;
  onInlineUpdate: (cardId: string, updates: Record<string, any>) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(card.title);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState(card.dueDate ? card.dueDate.split("T")[0] : "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activityTab, setActivityTab] = useState<"all" | "history">("all");

  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const prioCfg = PRIORITY_CONFIG[card.priority];
  const blockers = card.dependencies?.filter((d) => d.type === "blocked_by") || [];
  const dependsOn = card.dependencies?.filter((d) => d.type === "depends_on") || [];
  const sprintName = card.sprintId ? sprints.find((s) => s._id === card.sprintId)?.name || "Sprint" : "Backlog";

  // Fetch activity history
  useEffect(() => {
    const fetchActivities = async () => {
      setLoadingActivities(true);
      try {
        const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
        if (res.ok) {
          const data = await res.json();
          setActivities(data.activities || []);
        }
      } catch (err) {
        console.error("Failed to load activities:", err);
      } finally {
        setLoadingActivities(false);
      }
    };
    fetchActivities();
  }, [card._id, basePath]);

  const filteredActivities = useMemo(() => {
    if (activityTab === "history") {
      return activities.filter((a) => ["moved", "moved_backward", "assigned", "unassigned", "priority_changed", "title_changed", "sprint_changed"].includes(a.type));
    }
    return activities;
  }, [activities, activityTab]);

  const saveTitle = async () => {
    if (!titleValue.trim() || titleValue.trim() === card.title) { setEditingTitle(false); setTitleValue(card.title); return; }
    setSavingField("title");
    await onInlineUpdate(card._id, { title: titleValue.trim() });
    setEditingTitle(false);
    setSavingField(null);
    // Refresh activities
    const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
    if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
  };

  const saveDueDate = async (newDate: string) => {
    setDueDateValue(newDate);
    setSavingField("dueDate");
    await onInlineUpdate(card._id, { dueDate: newDate || null });
    setEditingDueDate(false);
    setSavingField(null);
    const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
    if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
  };

  const saveAssignee = async (userId: string) => {
    const selectedUser = users.find((u) => u.id === userId);
    setSavingField("assignee");
    await onInlineUpdate(card._id, { assigneeId: userId || undefined, assigneeName: selectedUser?.name || undefined, assigneeEmail: selectedUser?.email || undefined });
    setSavingField(null);
    const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
    if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
  };

  const savePriority = async (priority: string) => {
    setSavingField("priority");
    await onInlineUpdate(card._id, { priority });
    setSavingField(null);
    const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
    if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
  };

  const [editingStoryPoints, setEditingStoryPoints] = useState(false);
  const [storyPointsValue, setStoryPointsValue] = useState<string>(card.storyPoints != null ? String(card.storyPoints) : "");
  useEffect(() => { setStoryPointsValue(card.storyPoints != null ? String(card.storyPoints) : ""); }, [card.storyPoints]);
  const saveStoryPoints = async () => {
    const num = storyPointsValue.trim() === "" ? undefined : Number(storyPointsValue);
    setSavingField("storyPoints");
    await onInlineUpdate(card._id, { storyPoints: num });
    setEditingStoryPoints(false);
    setSavingField(null);
    const res = await fetch(`${basePath}/api/custom-boards/activities?cardId=${card._id}`);
    if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) +
      " at " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          {editingTitle ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setEditingTitle(false); setTitleValue(card.title); } }}
                onBlur={saveTitle}
                autoFocus
                className="text-xl font-semibold h-auto py-1 px-2"
              />
              {savingField === "title" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <DialogTitle className="text-xl cursor-pointer hover:text-primary transition-colors" onClick={() => setEditingTitle(true)} title="Click to edit">
              {card.title}
            </DialogTitle>
          )}
          <Select value={card.priority} onValueChange={savePriority}>
            <SelectTrigger className={cn("w-auto h-7 text-xs border gap-1 px-2", prioCfg.color)}>
              {savingField === "priority" ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_CONFIG) as Array<keyof typeof PRIORITY_CONFIG>).map((p) => (
                <SelectItem key={p} value={p}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", PRIORITY_CONFIG[p].dot)} />
                    {PRIORITY_CONFIG[p].label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogDescription>
          In <Badge variant="secondary">{card.columnName}</Badge>
          <Badge variant="outline" className="ml-2 text-xs">{sprintName}</Badge>
          {card.createdByName && <span className="ml-2 text-xs">• Created by {card.createdByName}</span>}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[65vh]">
        <div className="space-y-5 mt-2 pr-3">
          {/* Description */}
          {card.description && (
            <div>
              <h4 className="text-sm font-semibold mb-1 text-muted-foreground">Description</h4>
              <p className="text-sm bg-muted/30 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">{card.description}</p>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <UserPlus className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Assignee</span>
                {savingField === "assignee" && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <Select value={card.assigneeId || "__none__"} onValueChange={(val) => saveAssignee(val === "__none__" ? "" : val)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Unassigned">{card.assigneeName || "Unassigned"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__"><span className="text-muted-foreground italic">Unassigned</span></SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5"><AvatarImage src={u.image} /><AvatarFallback className="text-[10px]">{u.name?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback></Avatar>
                        <span>{u.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Due Date</span>
                {savingField === "dueDate" && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              {editingDueDate ? (
                <Input type="date" value={dueDateValue} onChange={(e) => saveDueDate(e.target.value)} onBlur={() => setEditingDueDate(false)} autoFocus className="h-9 text-sm" />
              ) : (
                <button
                  onClick={() => setEditingDueDate(true)}
                  className={cn("flex items-center gap-2 h-9 w-full px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors text-left", isOverdue && "border-red-500/50 text-red-400")}
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {card.dueDate ? (
                    <>
                      {new Date(card.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {isOverdue && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">Set due date</span>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Story Points</span>
                {savingField === "storyPoints" && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              {editingStoryPoints ? (
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} step={0.5} value={storyPointsValue} onChange={(e) => setStoryPointsValue(e.target.value)} onBlur={saveStoryPoints} onKeyDown={(e) => { if (e.key === "Enter") saveStoryPoints(); if (e.key === "Escape") { setEditingStoryPoints(false); setStoryPointsValue(card.storyPoints != null ? String(card.storyPoints) : ""); } }} autoFocus className="h-9 text-sm w-24" />
                </div>
              ) : (
                <button onClick={() => setEditingStoryPoints(true)} className="flex items-center gap-2 h-9 w-full px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors text-left text-cyan-400">
                  {card.storyPoints != null ? `${card.storyPoints} pt${card.storyPoints !== 1 ? "s" : ""}` : <span className="text-muted-foreground italic">Set points</span>}
                </button>
              )}
            </div>
          </div>

          {/* Labels */}
          {card.labels.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-4 w-4 text-muted-foreground" />
              {card.labels.map((label, i) => (<Badge key={i} variant="secondary" className="text-xs">{label}</Badge>))}
            </div>
          )}

          {/* Blockers */}
          {blockers.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-red-400 text-sm"><AlertTriangle className="h-4 w-4" />Blocked By ({blockers.length})</h4>
              <div className="space-y-2">
                {blockers.map((dep, idx) => (
                  <Card key={idx} className="border-red-500/30 bg-red-950/20">
                    <CardContent className="p-3 flex items-center justify-between">
                      <span className="text-sm">{dep.cardTitle || dep.cardId}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-red-500/10 hover:text-red-400" onClick={() => onRemoveDependency(card._id, dep.cardId, dep.type)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Depends On */}
          {dependsOn.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-400 text-sm"><Link2 className="h-4 w-4" />Depends On ({dependsOn.length})</h4>
              <div className="space-y-2">
                {dependsOn.map((dep, idx) => (
                  <Card key={idx} className="border-blue-500/30 bg-blue-950/20">
                    <CardContent className="p-3 flex items-center justify-between">
                      <span className="text-sm">{dep.cardTitle || dep.cardId}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-blue-500/10 hover:text-blue-400" onClick={() => onRemoveDependency(card._id, dep.cardId, dep.type)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ==================== ACTIVITY HISTORY ==================== */}
          <div className="border-t border-border/50 pt-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Activity
            </h4>

            {/* Activity Tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-border/30 pb-2">
              {(["all", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActivityTab(tab)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    activityTab === tab
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {tab === "all" ? "All" : "History"}
                </button>
              ))}
            </div>

            {/* Activity List */}
            {loadingActivities ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <History className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p>No activity yet</p>
              </div>
            ) : (
              <div className="space-y-0">
                {filteredActivities.map((act, idx) => {
                  const config = ACTIVITY_CONFIG[act.type] || { icon: Activity, label: act.type, color: "text-muted-foreground" };
                  const IconComponent = config.icon;
                  const isBackward = act.isBackwardMove;

                  return (
                    <div key={act._id || idx} className="relative pl-8 pb-4 group">
                      {/* Timeline line */}
                      {idx < filteredActivities.length - 1 && (
                        <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border/50" />
                      )}

                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-0 top-1 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors",
                        isBackward
                          ? "bg-red-500/10 border-red-500/40"
                          : "bg-card border-border/50 group-hover:border-primary/30"
                      )}>
                        <IconComponent className={cn("h-3.5 w-3.5", isBackward ? "text-red-400" : config.color)} />
                      </div>

                      {/* Activity content */}
                      <div className={cn(
                        "rounded-lg p-3 transition-colors",
                        isBackward
                          ? "bg-red-500/5 border border-red-500/20"
                          : "hover:bg-muted/30"
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Avatar className="h-5 w-5 shrink-0">
                                <AvatarFallback className={cn(
                                  "text-[10px] font-medium",
                                  isBackward
                                    ? "bg-red-500/20 text-red-400"
                                    : "bg-primary/20 text-primary"
                                )}>
                                  {act.userName?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{act.userName}</span>
                              <span className="text-sm text-muted-foreground">{config.label}</span>
                            </div>

                            {/* Value change display */}
                            {(act.fromValue || act.toValue) && act.type !== "created" && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs flex-wrap">
                                {act.fromValue && (
                                  <Badge variant="outline" className={cn(
                                    "text-[10px] font-mono",
                                    isBackward ? "border-red-500/30 text-red-400 line-through" : ""
                                  )}>
                                    {act.fromValue}
                                  </Badge>
                                )}
                                {act.fromValue && act.toValue && (
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                )}
                                {act.toValue && (
                                  <Badge variant="outline" className={cn(
                                    "text-[10px] font-mono",
                                    isBackward ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-primary/30 bg-primary/5 text-primary"
                                  )}>
                                    {act.toValue}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Backward move alert */}
                            {isBackward && (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                  <span className="text-red-400 font-medium">
                                    Moved backward from &quot;{act.fromValue}&quot; to &quot;{act.toValue}&quot;
                                  </span>
                                </div>
                                {act.metadata?.backwardReason && (
                                  <div className="text-xs text-muted-foreground bg-muted/30 border border-border/30 rounded-md px-2.5 py-1.5 italic">
                                    Reason: {act.metadata.backwardReason}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5" title={formatFullDate(act.createdAt)}>
                            {formatRelativeTime(act.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <DialogFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onAddDependency}><Link2 className="h-4 w-4 mr-1" />Add Dependency</Button>
        <Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="h-4 w-4 mr-1" />Edit</Button>
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
      </DialogFooter>
    </>
  );
}

// ================================================================
// DnD Components (Column, Card)
// ================================================================

function SortableColumn({ columnName, columnId, cards, colIndex, isDraggingColumn, onAddCard, onCardClick, onAddDependency, onEditCard, onDeleteCard, onDeleteColumn, canDeleteColumn }: {
  columnName: string; columnId: string; cards: CardData[]; colIndex: number; isDraggingColumn: boolean;
  onAddCard: () => void; onCardClick: (card: CardData) => void; onAddDependency: (card: CardData) => void;
  onEditCard: (card: CardData) => void; onDeleteCard: (cardId: string) => void;
  onDeleteColumn?: (columnName: string) => void; canDeleteColumn?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
    data: { type: "column", columnName },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={cn("flex-shrink-0 w-80 transition-opacity", isDragging && "opacity-40")}>
      <CustomKanbanColumn columnName={columnName} cards={cards} colIndex={colIndex} isDraggingColumn={isDraggingColumn}
        onAddCard={onAddCard} onCardClick={onCardClick} onAddDependency={onAddDependency} onEditCard={onEditCard} onDeleteCard={onDeleteCard}
        onDeleteColumn={onDeleteColumn} canDeleteColumn={canDeleteColumn}
        dragListeners={listeners} isDragging={isDragging} />
    </div>
  );
}

function ColumnDragOverlay({ columnName, cardCount, colIndex }: { columnName: string; cardCount: number; colIndex: number }) {
  const gradient = COLUMN_GRADIENTS[colIndex % COLUMN_GRADIENTS.length];
  const accent = COLUMN_ACCENT_COLORS[colIndex % COLUMN_ACCENT_COLORS.length];
  return (
    <div className="w-80">
      <Card className={cn("border-t-3 bg-card/90 backdrop-blur-md shadow-2xl ring-2 ring-primary/50 rotate-[2deg] scale-[1.02]", accent)}>
        <CardContent className="p-0">
          <div className={cn("p-4 border-b border-border/50 bg-gradient-to-r rounded-t-lg", gradient)}>
            <div className="flex items-center gap-2">
              <GripHorizontal className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">{columnName}</h3>
              <Badge variant="outline" className="text-xs">{cardCount}</Badge>
            </div>
          </div>
          <div className="p-4">
            <div className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg bg-muted/10">
              {cardCount} card{cardCount !== 1 ? "s" : ""}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomKanbanColumn({ columnName, cards, colIndex, isDraggingColumn, onAddCard, onCardClick, onAddDependency, onEditCard, onDeleteCard, onDeleteColumn, canDeleteColumn, dragListeners, isDragging = false }: {
  columnName: string; cards: CardData[]; colIndex: number; isDraggingColumn: boolean;
  onAddCard: () => void; onCardClick: (card: CardData) => void; onAddDependency: (card: CardData) => void;
  onEditCard: (card: CardData) => void; onDeleteCard: (cardId: string) => void;
  onDeleteColumn?: (columnName: string) => void; canDeleteColumn?: boolean;
  dragListeners?: any; isDragging?: boolean;
}) {
  const gradient = COLUMN_GRADIENTS[colIndex % COLUMN_GRADIENTS.length];
  const accent = COLUMN_ACCENT_COLORS[colIndex % COLUMN_ACCENT_COLORS.length];
  const { setNodeRef, isOver } = useDroppable({
    id: `card-drop::${columnName}`,
    data: { type: "column", columnName },
    disabled: isDraggingColumn,
  });

  return (
    <div ref={setNodeRef}>
      <Card className={cn("h-full transition-all border-t-3 bg-card/50 backdrop-blur-sm", accent, isOver && "ring-2 ring-primary ring-offset-2 shadow-lg shadow-primary/10")}>
        <CardContent className="p-0">
          <div className={cn("p-4 border-b border-border/50 bg-gradient-to-r rounded-t-lg", gradient)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div {...dragListeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-white/10 rounded transition-colors" title="Drag to reorder">
                  <GripHorizontal className="h-4 w-4 text-foreground/60 hover:text-foreground" />
                </div>
                <h3 className="font-semibold">{columnName}</h3>
                <Badge variant="outline" className="text-xs font-medium">{cards.length}</Badge>
              </div>
              <div className="flex items-center gap-0.5">
                {canDeleteColumn && onDeleteColumn && cards.length === 0 && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-400" onClick={() => onDeleteColumn(columnName)} title="Delete column">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary" onClick={onAddCard} title="Add card">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <SortableContext items={cards.map((c) => c._id)} strategy={verticalListSortingStrategy}>
            <ScrollArea className="h-[calc(100vh-350px)]">
              <div className="p-2 space-y-2">
                {cards.map((card) => (
                  <SortableCustomCard key={card._id} card={card} colIndex={colIndex}
                    onClick={() => onCardClick(card)} onAddDependency={() => onAddDependency(card)}
                    onEdit={() => onEditCard(card)} onDelete={() => onDeleteCard(card._id)} />
                ))}
                {cards.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed border-border/50 rounded-lg bg-muted/20">
                    <p>Drop cards here</p>
                    <Button variant="ghost" size="sm" onClick={onAddCard} className="mt-2 hover:bg-primary/10 hover:text-primary">
                      <Plus className="h-4 w-4 mr-1" /> Add card
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableCustomCard({ card, colIndex, onClick, onAddDependency, onEdit, onDelete }: {
  card: CardData; colIndex: number; onClick: () => void; onAddDependency: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card._id, data: { type: "task", card } });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <CustomTaskCard card={card} colIndex={colIndex} onClick={onClick} onAddDependency={onAddDependency} onEdit={onEdit} onDelete={onDelete} isDragging={isDragging} dragListeners={listeners} />
    </div>
  );
}

function CustomTaskCard({ card, colIndex, onClick, onAddDependency, onEdit, onDelete, isDragging = false, dragListeners }: {
  card: CardData; colIndex: number; onClick: () => void; onAddDependency: () => void; onEdit: () => void; onDelete: () => void;
  isDragging?: boolean; dragListeners?: any;
}) {
  const hasBlockers = card.dependencies?.some((d) => d.type === "blocked_by");
  const hasDependencies = card.dependencies?.some((d) => d.type === "depends_on");
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const prioCfg = PRIORITY_CONFIG[card.priority];
  const accentColor = COLUMN_ACCENT_COLORS[colIndex % COLUMN_ACCENT_COLORS.length];

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-lg transition-all border-l-4 group bg-card/80 backdrop-blur-sm hover:bg-card",
        accentColor, hasBlockers && "bg-red-950/20 border-red-500/50", isDragging && "opacity-50 shadow-xl rotate-2 scale-105"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div {...dragListeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded transition-colors" onClick={(e) => e.stopPropagation()}>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <Badge className={cn("text-xs border", prioCfg.color)}>
              <div className={cn("w-1.5 h-1.5 rounded-full mr-1", prioCfg.dot)} />{prioCfg.label}
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddDependency(); }}><Link2 className="h-3.5 w-3.5 mr-2" />Add Dependency</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}><Edit3 className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-red-400 focus:text-red-400"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{card.title}</p>
        {card.labels.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {card.labels.slice(0, 3).map((label, i) => (<Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{label}</Badge>))}
            {card.labels.length > 3 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{card.labels.length - 3}</Badge>}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {hasBlockers && (
            <div className="flex items-center gap-1 text-xs text-red-400 bg-red-950/30 border border-red-800/30 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" /><span>Blocked</span>
            </div>
          )}
          {hasDependencies && !hasBlockers && (
            <div className="flex items-center gap-1 text-xs text-blue-400 bg-blue-950/30 border border-blue-800/30 px-2 py-0.5 rounded-full">
              <Link2 className="h-3 w-3" /><span>Has deps</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          {card.dueDate ? (
            <div className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-red-400" : "text-muted-foreground")}>
              <Calendar className="h-3 w-3" />
              <span>{new Date(card.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              {isOverdue && <AlertTriangle className="h-3 w-3 ml-1 text-red-500" />}
            </div>
          ) : <div />}
          {card.assigneeName ? (
            <Avatar className="h-6 w-6 border-2 border-primary/20">
              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white text-xs">
                {card.assigneeName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          ) : <div />}
        </div>
      </CardContent>
    </Card>
  );
}
