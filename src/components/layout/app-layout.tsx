// src/components/layout/app-layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarProvider, SidebarInset, SidebarTrigger, SidebarHeader, SidebarContent } from "@/components/ui/sidebar";
import SidebarNav from "@/components/layout/sidebar-nav";
import { ProjectInsightsLogo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { UserCircle, LogOut, Settings, User, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/webhooks/NotificationBell";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const pathname = usePathname();
  
  // For auth pages and shared pages, render without sidebar
  const isAuthPage = pathname?.startsWith('/auth');
  const isSharedPage = pathname?.startsWith('/shared');
  
  if (isAuthPage || isSharedPage) {
    return <>{children}</>;
  }
  
  // Show loading state while checking authentication
  if (isAuthenticated === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
        <SidebarHeader className="p-4 border-b border-sidebar-border/50">
          <Link href="/dashboard" className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center transition-all duration-200">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <ProjectInsightsLogo className="h-9 w-9 text-primary relative" />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Project Insights
              </span>
              <p className="text-[10px] text-muted-foreground -mt-0.5">Unified Management</p>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-[5] flex h-16 items-center justify-between gap-4 border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <SidebarTrigger className="hover:bg-accent/10 rounded-lg transition-colors" />
            <Link href="/dashboard" className="flex items-center gap-2">
              <ProjectInsightsLogo className="h-7 w-7 text-primary" />
              <span className="font-bold text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                Project Insights
              </span>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <SidebarTrigger className="hover:bg-accent/10 rounded-lg transition-colors" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Notification Bell */}
            {isAuthenticated && <NotificationBell />}
            
            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full ring-2 ring-transparent hover:ring-primary/20 transition-all duration-200">
                    <Avatar className="h-9 w-9 border-2 border-primary/20">
                      <AvatarImage src={user.image || ''} alt={user.name || 'User'} />
                      <AvatarFallback className="text-sm font-medium bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary">
                        {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="sr-only">User Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-2 animate-scale-in">
                  <DropdownMenuLabel className="p-3 bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-lg mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-primary/20">
                        <AvatarImage src={user.image || ''} />
                        <AvatarFallback className="text-sm font-medium bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary">
                          {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <p className="text-sm font-semibold">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{user.email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg transition-colors">
                    <Link href="/dashboard" className="flex items-center gap-2 p-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg transition-colors">
                    <Link href="/settings" className="flex items-center gap-2 p-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem 
                    className="flex items-center gap-2 p-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer rounded-lg transition-colors"
                    onClick={() => logout()}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="default" size="sm" asChild className="rounded-full">
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 page-transition">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
