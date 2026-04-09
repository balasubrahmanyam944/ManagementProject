"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";

const defaultRoles = ["Manager", "Developer", "Tester", "Admin"];

type FormData = {
  fullName: string;
  email: string;
  password: string;
  role: string;
};

export default function AdminPanelPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState<'role' | 'user'>('role');
  const [customRole, setCustomRole] = useState("");
  const [roles, setRoles] = useState(defaultRoles);
  const form = useForm<FormData>({ defaultValues: { fullName: "", email: "", password: "", role: defaultRoles[0] } });

  if (!user || user.role !== "ADMIN") {
    return <div className="p-8">Access denied. Admins only.</div>;
  }

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRole.trim()) {
      setError("Role name cannot be empty.");
      setSuccess("");
      return;
    }
    if (roles.includes(customRole.trim())) {
      setError("Role already exists.");
      setSuccess("");
      return;
    }
    setRoles([customRole.trim(), ...roles]);
    setCustomRole("");
    setError("");
    setSuccess("Role created successfully!");
  };

  const onSubmit = async (data: FormData) => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Failed to create user");
      setSuccess("User created successfully!");
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      <div className="flex gap-4 mb-8">
        <Button
          type="button"
          variant={tab === 'role' ? 'default' : 'outline'}
          onClick={() => { setTab('role'); setError(""); setSuccess(""); }}
        >
          Create Role
        </Button>
        <Button
          type="button"
          variant={tab === 'user' ? 'default' : 'outline'}
          onClick={() => { setTab('user'); setError(""); setSuccess(""); }}
        >
          Create User
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/roles')}
        >
          Edit Roles
        </Button>
      </div>
      {tab === 'role' && (
        <form onSubmit={handleCreateRole} className="space-y-4">
          <div>
            <label className="block font-medium mb-2">Role Name</label>
            <Input
              placeholder="Enter new role (e.g. Product Owner)"
              value={customRole}
              onChange={e => setCustomRole(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">Create Role</Button>
          {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
          {success && <div className="text-green-600 text-sm mt-2">{success}</div>}
        </form>
      )}
      {tab === 'user' && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField name="fullName" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Full Name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField name="email" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Email Address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField name="password" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField name="role" control={form.control} render={({ field }) => (
              <FormItem>
                <FormLabel>User Role</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full">Create User</Button>
            {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            {success && <div className="text-green-600 text-sm mt-2">{success}</div>}
          </form>
        </Form>
      )}
    </div>
  );
} 