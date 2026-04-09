// src/components/layout/sidebar-nav.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { LayoutDashboard, BarChart3, Smile, Puzzle, Settings2, FolderKanban, TestTube, MessageSquare, Columns3, Sparkles, Building2, Plus, ListPlus, Trash2, X, ChevronDown, ChevronRight, Award } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Note: Next.js Link components automatically handle basePath from next.config.ts
// We should NOT manually prepend basePath here as it will cause double paths

interface CustomBoard {
  _id: string;
  name: string;
  columns: string[];
  createdBy: string;
  createdByName: string;
  subscribers: string[];
  allowedUsers: string[];
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-blue-500 to-cyan-400" },
  { href: "/project-overview", label: "Project Overview", icon: FolderKanban, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER'], color: "from-violet-500 to-purple-400" },
  { href: "/board", label: "Kanban Board", icon: Columns3, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-emerald-500 to-teal-400" },
  { href: "/communication-overview", label: "Communication", icon: MessageSquare, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER'], color: "from-pink-500 to-rose-400" },
  { href: "/velocity", label: "Velocity Graphs", icon: BarChart3, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-amber-500 to-orange-400" },
  { href: "/sentiment-analysis", label: "Sentiment Analysis", icon: Smile, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-green-500 to-emerald-400" },
  { href: "/integrations", label: "Integrations", icon: Puzzle, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-indigo-500 to-blue-400" },
  { href: "/performance", label: "Performance", icon: Award, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-purple-500 to-indigo-400" },
  { href: "/admin", label: "Admin Panel", icon: Settings2, roles: ['ADMIN'], color: "from-red-500 to-pink-400" },
  { href: "/testcases", label: "Testcases", icon: TestTube, roles: ['TESTER', 'ADMIN', 'MANAGER'], color: "from-cyan-500 to-blue-400" },
];

const bottomNavItems = [
  { href: "/settings", label: "Settings", icon: Settings2, roles: ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'DEVELOPER', 'TESTER'], color: "from-slate-500 to-slate-400" },
]

const BOARD_COLORS = [
  "from-violet-500 to-purple-400",
  "from-fuchsia-500 to-pink-400",
  "from-rose-500 to-red-400",
  "from-teal-500 to-emerald-400",
  "from-sky-500 to-blue-400",
  "from-amber-500 to-yellow-400",
  "from-lime-500 to-green-400",
  "from-orange-500 to-red-400",
];

export default function SidebarNav() {
  const pathname = usePathname();
  const { user, hasRole } = useAuth();
  
  // Check if we're on the main app (port 9003) vs tenant instance
  const [isMainApp, setIsMainApp] = useState(false);

  // Custom boards state
  const [customBoards, setCustomBoards] = useState<CustomBoard[]>([]);
  const [allBoards, setAllBoards] = useState<CustomBoard[]>([]);
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isAddBoardOpen, setIsAddBoardOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardColumns, setBoardColumns] = useState<string[]>(["To Do", "In Progress", "Done"]);
  const [newColumnInput, setNewColumnInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [boardsExpanded, setBoardsExpanded] = useState(true);
  
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
  const isManager = hasRole(['MANAGER', 'ADMIN']);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const port = window.location.port || (window.location.host.includes(':') ? window.location.host.split(':')[1] : '');
      const isMain = port === '9003' || (!port && window.location.hostname === 'localhost');
      setIsMainApp(isMain);
    }
  }, []);

  // Fetch custom boards
  const fetchCustomBoards = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards?subscribedOnly=true`);
      if (res.ok) {
        const data = await res.json();
        setCustomBoards(data.boards || []);
      }
    } catch (err) {
      console.error('Failed to fetch custom boards:', err);
    }
  }, [basePath]);

  const fetchAllBoards = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/api/custom-boards?subscribedOnly=false`);
      if (res.ok) {
        const data = await res.json();
        setAllBoards(data.boards || []);
      }
    } catch (err) {
      console.error('Failed to fetch all boards:', err);
    }
  }, [basePath]);

  useEffect(() => {
    if (user) {
      fetchCustomBoards();
    }
  }, [user, fetchCustomBoards]);

  // Create board handler
  const handleCreateBoard = async () => {
    if (!boardName.trim() || boardColumns.length === 0) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${basePath}/api/custom-boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: boardName.trim(),
          columns: boardColumns.filter(c => c.trim()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create board');
      }
      setIsCreateBoardOpen(false);
      setBoardName("");
      setBoardColumns(["To Do", "In Progress", "Done"]);
      setNewColumnInput("");
      fetchCustomBoards();
    } catch (err: any) {
      alert(err.message || 'Failed to create board');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete board handler
  const handleDeleteBoard = async (boardId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this board? All cards will be permanently removed.')) return;
    try {
      const res = await fetch(`${basePath}/api/custom-boards?id=${boardId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete board');
      }
      fetchCustomBoards();
    } catch (err: any) {
      alert(err.message || 'Failed to delete board');
    }
  };

  // Subscribe to a board
  const handleSubscribe = async (boardId: string) => {
    try {
      await fetch(`${basePath}/api/custom-boards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, action: 'subscribe' }),
      });
      fetchCustomBoards();
      fetchAllBoards();
    } catch (err) {
      console.error('Failed to subscribe:', err);
    }
  };

  // Unsubscribe from a board
  const handleUnsubscribe = async (boardId: string) => {
    try {
      await fetch(`${basePath}/api/custom-boards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, action: 'unsubscribe' }),
      });
      fetchCustomBoards();
      fetchAllBoards();
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
    }
  };

  // Add column to new board form
  const addColumnToForm = () => {
    if (newColumnInput.trim() && !boardColumns.includes(newColumnInput.trim())) {
      setBoardColumns([...boardColumns, newColumnInput.trim()]);
      setNewColumnInput("");
    }
  };

  const removeColumnFromForm = (idx: number) => {
    setBoardColumns(boardColumns.filter((_, i) => i !== idx));
  };

  // Tenants menu item
  const allNavItems = useMemo(() => {
    if (isMainApp) {
      return [
        ...navItems,
        {
          href: "/tenants",
          label: "Tenants",
          icon: Building2,
          roles: ['ADMIN', 'MANAGER'],
          color: "from-purple-500 to-pink-400"
        }
      ];
    }
    return navItems;
  }, [isMainApp]);
  
  // Filter navigation items based on user role and allowedPages
  const filteredNavItems = allNavItems.filter(item => {
    if (!item) return false;
    if (!user) return false;
    
    const pageKey = item.href.substring(1);
    const hasExplicitPageAccess = user.allowedPages && user.allowedPages.includes(pageKey);
    const hasRequiredRole = item.roles.includes(user.role);
    
    if ((pageKey === 'communication-overview' || pageKey === 'board') && user.allowedPages) {
      const hasProjectOverviewAccess = user.allowedPages.includes('project-overview');
      if (hasProjectOverviewAccess && hasRequiredRole) {
        return true;
      }
    }
    
    if (pageKey === 'board' && hasRequiredRole && !user.allowedPages) {
      return true;
    }

    if (pageKey === 'performance' && hasRequiredRole) {
      return true;
    }
    
    if (pageKey === 'tenants' && hasRequiredRole && isMainApp) {
      return true;
    }
    
    return hasExplicitPageAccess || (hasRequiredRole && (!user.allowedPages || user.allowedPages.includes(pageKey)));
  });

  const filteredBottomNavItems = bottomNavItems.filter(item => {
    if (!user) return false;
    const hasExplicitPageAccess = user.allowedPages && user.allowedPages.includes(item.href.substring(1));
    const hasRequiredRole = item.roles.includes(user.role);
    return hasExplicitPageAccess || (hasRequiredRole && (!user.allowedPages || user.allowedPages.includes(item.href.substring(1))));
  });

  const isActive = (href: string) => {
    return pathname === href || (href !== "/dashboard" && href !== "/" && pathname.startsWith(href));
  };

  // Check if Kanban Board is visible in the sidebar
  const hasKanbanInSidebar = filteredNavItems.some(item => item.href === '/board');

  return (
    <div className="flex h-full flex-col py-2">
      <SidebarMenu className="flex-1 space-y-1">
        {filteredNavItems.map((item, index) => {
          const active = isActive(item.href);
          const isKanbanItem = item.href === '/board';

          return (
            <div key={item.label}>
              <SidebarMenuItem className="px-2" style={{ animationDelay: `${index * 30}ms` }}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={{ children: item.label, side: "right", align: "center", className: "ml-2 font-medium" }}
                  className={`
                    justify-start relative overflow-hidden rounded-xl transition-all duration-200 
                    group/item hover:bg-accent/10
                    ${active ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-md' : ''}
                  `}
                >
                  <Link href={item.href} className="flex items-center gap-3 py-2.5 px-3">
                    <div className={`
                      relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                      ${active 
                        ? 'bg-white/20' 
                        : 'bg-gradient-to-br ' + item.color + ' bg-opacity-10 group-hover/item:scale-110'
                      }
                    `}>
                      <item.icon className={`h-4.5 w-4.5 transition-transform duration-200 group-hover/item:scale-110 ${active ? 'text-white' : 'text-white'}`} />
                    </div>
                    <span className={`
                      group-data-[collapsible=icon]:hidden font-medium transition-colors
                      ${active ? 'text-white' : 'text-foreground/80 group-hover/item:text-foreground'}
                    `}>
                      {item.label}
                    </span>
                    {active && (
                      <Sparkles className="absolute right-3 h-3.5 w-3.5 text-white/60 animate-pulse group-data-[collapsible=icon]:hidden" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Custom Boards Section - rendered right after Kanban Board if it's in the sidebar */}
              {isKanbanItem && (
                <CustomBoardsSidebarSection
                  customBoards={customBoards}
                  isManager={isManager}
                  user={user}
                  isActive={isActive}
                  onCreateBoard={() => setIsCreateBoardOpen(true)}
                  onAddBoard={() => { setIsAddBoardOpen(true); fetchAllBoards(); }}
                  onDeleteBoard={handleDeleteBoard}
                />
              )}
            </div>
          );
        })}

        {/* Custom Boards Section - rendered as standalone when Kanban Board is NOT in the sidebar */}
        {!hasKanbanInSidebar && (customBoards.length > 0 || isManager) && (
          <CustomBoardsSidebarSection
            customBoards={customBoards}
            isManager={isManager}
            user={user}
            isActive={isActive}
            onCreateBoard={() => setIsCreateBoardOpen(true)}
            onAddBoard={() => { setIsAddBoardOpen(true); fetchAllBoards(); }}
            onDeleteBoard={handleDeleteBoard}
            showHeader
          />
        )}
      </SidebarMenu>
      
      <div className="mt-auto px-2 pt-2 border-t border-sidebar-border/50">
        <SidebarMenu className="space-y-1">
          {filteredBottomNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={{ children: item.label, side: "right", align: "center", className: "ml-2 font-medium" }}
                  className={`
                    justify-start relative overflow-hidden rounded-xl transition-all duration-200 
                    group/item hover:bg-accent/10
                    ${active ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-md' : ''}
                  `}
                >
                  <Link href={item.href} className="flex items-center gap-3 py-2.5 px-3">
                    <div className={`
                      relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                      ${active 
                        ? 'bg-white/20' 
                        : 'bg-gradient-to-br ' + item.color + ' bg-opacity-10 group-hover/item:scale-110'
                      }
                    `}>
                      <item.icon className={`h-4.5 w-4.5 transition-transform duration-200 group-hover/item:scale-110 ${active ? 'text-white' : 'text-white'}`} />
                    </div>
                    <span className={`
                      group-data-[collapsible=icon]:hidden font-medium transition-colors
                      ${active ? 'text-white' : 'text-foreground/80 group-hover/item:text-foreground'}
                    `}>
                      {item.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </div>

      {/* Create Board Modal (Manager/Admin) */}
      <Dialog open={isCreateBoardOpen} onOpenChange={setIsCreateBoardOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                <Columns3 className="h-4 w-4 text-white" />
              </div>
              Create Custom Board
            </DialogTitle>
            <DialogDescription>
              Create a new Kanban board with custom columns. Team members can add it to their sidebar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Board Name *</Label>
              <Input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="e.g., Sprint Board, Bug Tracker"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Columns</Label>
              <div className="mt-2 space-y-2">
                {boardColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {idx + 1}
                      </Badge>
                      <Input
                        value={col}
                        onChange={(e) => {
                          const updated = [...boardColumns];
                          updated[idx] = e.target.value;
                          setBoardColumns(updated);
                        }}
                        className="border-0 bg-transparent h-7 p-0 focus-visible:ring-0 text-sm"
                        placeholder="Column name"
                      />
                    </div>
                    <button
                      onClick={() => removeColumnFromForm(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded text-red-400"
                      disabled={boardColumns.length <= 1}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add column input */}
              <div className="flex items-center gap-2 mt-2">
                <Input
                  value={newColumnInput}
                  onChange={(e) => setNewColumnInput(e.target.value)}
                  placeholder="Add another column..."
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addColumnToForm()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addColumnToForm}
                  disabled={!newColumnInput.trim()}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateBoardOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBoard}
              disabled={!boardName.trim() || boardColumns.filter(c => c.trim()).length === 0 || isCreating}
              className="bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Board
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Board Modal (Non-manager users) */}
      <Dialog open={isAddBoardOpen} onOpenChange={setIsAddBoardOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <ListPlus className="h-4 w-4 text-white" />
              </div>
              Add Boards to Sidebar
            </DialogTitle>
            <DialogDescription>
              Select boards created by managers to add to your sidebar.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {allBoards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No custom boards available yet. Ask your manager to create one.
                </p>
              ) : (
                allBoards.map((board) => {
                  const isSubscribed = board.subscribers?.includes(user?.id || '');
                  return (
                    <div
                      key={board._id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        id={`board-${board._id}`}
                        checked={isSubscribed}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleSubscribe(board._id);
                          } else {
                            handleUnsubscribe(board._id);
                          }
                        }}
                      />
                      <label
                        htmlFor={`board-${board._id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{board.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {board.columns.length} cols
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          by {board.createdByName} • {board.columns.join(', ')}
                        </p>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button onClick={() => setIsAddBoardOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Custom Boards Sidebar Section (extracted for reuse)
// ============================================================
function CustomBoardsSidebarSection({
  customBoards,
  isManager,
  user,
  isActive,
  onCreateBoard,
  onAddBoard,
  onDeleteBoard,
  showHeader = false,
}: {
  customBoards: CustomBoard[];
  isManager: boolean;
  user: any;
  isActive: (href: string) => boolean;
  onCreateBoard: () => void;
  onAddBoard: () => void;
  onDeleteBoard: (boardId: string, e: React.MouseEvent) => void;
  showHeader?: boolean;
}) {
  return (
    <div className="group-data-[collapsible=icon]:hidden">
      {/* Optional header when shown standalone (not under Kanban Board) */}
      {showHeader && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Custom Boards
          </p>
        </div>
      )}

      {/* Action button: Create (manager) or Add (others) */}
      <div className="px-4 mt-1 mb-1">
        {isManager ? (
          <button
            onClick={onCreateBoard}
            className="flex items-center gap-2 w-full text-xs text-primary/80 hover:text-primary py-1.5 px-2 rounded-lg hover:bg-primary/10 transition-all duration-200 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create custom board</span>
          </button>
        ) : (
          <button
            onClick={onAddBoard}
            className="flex items-center gap-2 w-full text-xs text-primary/80 hover:text-primary py-1.5 px-2 rounded-lg hover:bg-primary/10 transition-all duration-200 font-medium"
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        )}
      </div>

      {/* Custom boards list */}
      {customBoards.length > 0 && (
        <div className="px-2 space-y-0.5">
          {customBoards.map((board, bIdx) => {
            const boardHref = `/custom-board/${board._id}`;
            const boardActive = isActive(boardHref);
            const boardColor = BOARD_COLORS[bIdx % BOARD_COLORS.length];
            const isCreator = user?.id === board.createdBy;

            return (
              <SidebarMenuItem key={board._id} className="px-0">
                <SidebarMenuButton
                  asChild
                  isActive={boardActive}
                  tooltip={{ children: board.name, side: "right", align: "center", className: "ml-2 font-medium" }}
                  className={`
                    justify-start relative overflow-hidden rounded-lg transition-all duration-200 
                    group/board hover:bg-accent/10 text-sm h-9
                    ${boardActive ? 'bg-gradient-to-r ' + boardColor + ' text-white shadow-sm' : ''}
                  `}
                >
                  <Link href={boardHref} className="flex items-center gap-2.5 py-1.5 px-3 w-full">
                    <div className={`
                      relative z-10 flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200
                      ${boardActive 
                        ? 'bg-white/20' 
                        : 'bg-gradient-to-br ' + boardColor + ' bg-opacity-10'
                      }
                    `}>
                      <Columns3 className={`h-3.5 w-3.5 ${boardActive ? 'text-white' : 'text-white'}`} />
                    </div>
                    <span className={`
                      flex-1 truncate text-xs font-medium transition-colors
                      ${boardActive ? 'text-white' : 'text-foreground/70 group-hover/board:text-foreground'}
                    `}>
                      {board.name}
                    </span>
                    {isCreator && isManager && (
                      <button
                        onClick={(e) => onDeleteBoard(board._id, e)}
                        className="opacity-0 group-hover/board:opacity-100 transition-opacity p-0.5 hover:bg-red-500/20 rounded"
                        title="Delete board"
                      >
                        <Trash2 className={`h-3 w-3 ${boardActive ? 'text-white/70 hover:text-white' : 'text-red-400'}`} />
                      </button>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </div>
      )}
    </div>
  );
}
