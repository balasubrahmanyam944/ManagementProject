"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const ALL_ROLES = ['USER', 'ADMIN', 'PREMIUM', 'MANAGER', 'TESTER', 'DEVELOPER'];
const ALL_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'project-overview', label: 'Project Overview' },
  { key: 'velocity', label: 'Velocity Graphs' },
  { key: 'sentiment-analysis', label: 'Sentiment Analysis' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'testcases', label: 'Testcases' },
  { key: 'settings', label: 'Settings' },
];

// Helper to get basePath from URL
const getBasePath = (): string => {
  if (typeof window === 'undefined') return '';
  const pathname = window.location.pathname;
  // Extract basePath: /gmail/admin/roles -> /gmail
  const adminIndex = pathname.indexOf('/admin');
  if (adminIndex > 0) {
    return pathname.substring(0, adminIndex);
  }
  return process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
};

// Default allowedPages for each role
const getDefaultAllowedPages = (role: string): string[] => {
  switch (role) {
    case 'ADMIN':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings', 'admin']
    case 'MANAGER':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'DEVELOPER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'settings']
    case 'TESTER':
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'PREMIUM':
      return ['dashboard', 'project-overview', 'velocity', 'sentiment-analysis', 'integrations', 'testcases', 'settings']
    case 'USER':
    default:
      return ['dashboard', 'velocity', 'sentiment-analysis', 'integrations', 'settings']
  }
};

export default function EditRolesPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Get basePath once on mount
  const basePath = useMemo(() => getBasePath(), []);

  useEffect(() => {
    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/api/admin/list-users`);
      const text = await res.text();
      
      if (!res.ok) {
        let errorMsg = 'Failed to fetch users';
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }
      
      const data = JSON.parse(text);
      if (data.success) {
        // Update users with default allowedPages if they don't have any
        const updatedUsers = data.users.map((user: any) => {
          if (!user.allowedPages || user.allowedPages.length === 0) {
            return {
              ...user,
              allowedPages: getDefaultAllowedPages(user.role)
            };
          }
          return user;
        });
        setUsers(updatedUsers);
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to fetch users', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    setUsers(users => users.map(u => {
      if (u._id === userId) {
        // Update allowedPages when role changes
        const newAllowedPages = getDefaultAllowedPages(newRole);
        return { ...u, role: newRole, allowedPages: newAllowedPages };
      }
      return u;
    }));
  };

  const handlePageToggle = (userId: string, pageKey: string) => {
    setUsers(users => users.map(u => {
      if (u._id !== userId) return u;
      const allowedPages = u.allowedPages || [];
      return {
        ...u,
        allowedPages: allowedPages.includes(pageKey)
          ? allowedPages.filter((p: string) => p !== pageKey)
          : [...allowedPages, pageKey],
      };
    }));
  };

  const handleSave = async (user: any) => {
    setSaving(user._id);
    try {
      const res = await fetch(`${basePath}/api/admin/update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          role: user.role,
          allowedPages: user.allowedPages || [],
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.success) {
        toast({ title: 'User updated', description: 'User role and allowed pages updated.' });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update user', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update user', variant: 'destructive' });
    }
    setSaving(null);
    fetchUsers();
  };

  const resetToDefaults = async (user: any) => {
    const defaultPages = getDefaultAllowedPages(user.role);
    setUsers(users => users.map(u => 
      u._id === user._id ? { ...u, allowedPages: defaultPages } : u
    ));
  };

  const updateAllUsers = async () => {
    try {
      const res = await fetch(`${basePath}/api/admin/update-existing-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.success) {
        toast({ title: 'Success', description: data.message });
        fetchUsers(); // Refresh the list
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update users', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update users', variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm(`Are you sure you want to delete user "${user.name || user.email}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${basePath}/api/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.success) {
        toast({ title: 'Success', description: 'User deleted successfully.' });
        fetchUsers(); // Refresh the list
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete user', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete user', variant: 'destructive' });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Edit User Roles & Page Access</CardTitle>
            <Button onClick={updateAllUsers} variant="outline">
              Update All Users with Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading users...</div>
          ) : (
            <div className="space-y-6">
              {users.map(user => (
                <div key={user._id} className="border-b pb-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{user.name || user.email}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                      <div className="text-xs text-primary">Role: {user.role}</div>
                    </div>
                    <div>
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user._id, value)}
                      >
                        <SelectTrigger className="w-[180px] bg-card border-border text-foreground">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {ALL_ROLES.map(role => (
                            <SelectItem 
                              key={role} 
                              value={role}
                              className="text-foreground focus:bg-accent focus:text-accent-foreground"
                            >
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="text-sm font-medium mb-2">Allowed Pages:</div>
                    <div className="flex flex-wrap gap-4 items-center mb-2">
                      {ALL_PAGES.map(page => (
                        <label key={page.key} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={user.allowedPages?.includes(page.key) || false}
                            onChange={() => handlePageToggle(user._id, page.key)}
                          />
                          {page.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(user)}
                      disabled={saving === user._id}
                    >
                      {saving === user._id ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetToDefaults(user)}
                    >
                      Reset to Defaults
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteUser(user)}
                    >
                      Delete User
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 