"use client"

import { useState, useEffect, useCallback } from "react"
import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { UserCircle, ShieldCheck, Save, Loader2, Eye, EyeOff, CheckCircle2, Settings } from "lucide-react"

interface UserProfile {
  id: string
  name: string
  email: string
  image: string
  role: string
  isVerified: boolean
  createdAt: string
  updatedAt: string
}

export default function SettingsPage() {
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
  const { toast } = useToast()

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [image, setImage] = useState('')

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Active section
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>('profile')

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${basePath}/api/user/profile`)
      if (!response.ok) throw new Error('Failed to fetch profile')
      const data = await response.json()
      if (data.success && data.profile) {
        setProfile(data.profile)
        setName(data.profile.name || '')
        setEmail(data.profile.email || '')
        setImage(data.profile.image || '')
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast({
        title: "Error",
        description: "Failed to load profile data.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [basePath, toast])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Track changes
  useEffect(() => {
    if (profile) {
      const changed =
        name !== (profile.name || '') ||
        email !== (profile.email || '') ||
        image !== (profile.image || '')
      setHasChanges(changed)
    }
  }, [name, email, image, profile])

  // Save profile
  const handleSaveProfile = async () => {
    if (!hasChanges) return

    try {
      setSaving(true)
      const response = await fetch(`${basePath}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, image }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Update Failed",
          description: data.error || 'Failed to update profile.',
          variant: "destructive",
        })
        return
      }

      if (data.success && data.profile) {
        setProfile(data.profile)
        setName(data.profile.name || '')
        setEmail(data.profile.email || '')
        setImage(data.profile.image || '')
        toast({
          title: "Profile Updated",
          description: "Your profile has been updated successfully.",
        })
      }
    } catch (error) {
      console.error('Error saving profile:', error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while saving.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  // Change password
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all password fields.",
        variant: "destructive",
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "New password and confirm password must match.",
        variant: "destructive",
      })
      return
    }

    try {
      setChangingPassword(true)
      const response = await fetch(`${basePath}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Password Change Failed",
          description: data.error || 'Failed to change password.',
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Password Changed",
        description: "Your password has been changed successfully.",
      })

      // Clear password fields
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      console.error('Error changing password:', error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while changing password.",
        variant: "destructive",
      })
    } finally {
      setChangingPassword(false)
    }
  }

  // Discard changes
  const handleDiscard = () => {
    if (profile) {
      setName(profile.name || '')
      setEmail(profile.email || '')
      setImage(profile.image || '')
    }
  }

  const navItems = [
    { key: 'profile' as const, label: 'Profile', icon: UserCircle, color: 'from-blue-500 to-cyan-500' },
    { key: 'security' as const, label: 'Security', icon: ShieldCheck, color: 'from-emerald-500 to-green-500' },
  ]

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Settings"
          description="Manage your account settings and preferences."
          icon={<Settings className="h-5 w-5 text-white" />}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading your settings...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your account settings and preferences."
        icon={<Settings className="h-5 w-5 text-white" />}
      />

      <div className="grid gap-8 md:grid-cols-3">
        {/* Sidebar Navigation */}
        <div className="md:col-span-1">
          <Card className="shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border/50">
              <div className="flex items-center gap-3">
                {profile?.image ? (
                  <img
                    src={profile.image}
                    alt={profile.name || 'User'}
                    className="h-12 w-12 rounded-full border-2 border-primary/30 object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-lg">
                    {(profile?.name || profile?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{profile?.name || 'User'}</CardTitle>
                  <CardDescription className="text-xs truncate">{profile?.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-3">
              {navItems.map((item) => (
                <Button
                  key={item.key}
                  variant={activeSection === item.key ? 'default' : 'ghost'}
                  className={`w-full justify-start transition-all duration-200 ${
                    activeSection === item.key
                      ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-md'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setActiveSection(item.key)}
                >
                  <item.icon className="mr-2 h-5 w-5" />
                  {item.label}
                </Button>
              ))}
            </CardContent>

            {/* Account Info */}
            <div className="px-4 pb-4">
              <Separator className="mb-3" />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Role</span>
                  <span className="font-medium text-foreground capitalize">{profile?.role?.toLowerCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className={`font-medium flex items-center gap-1 ${profile?.isVerified ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {profile?.isVerified && <CheckCircle2 className="h-3 w-3" />}
                    {profile?.isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                {profile?.createdAt && (
                  <div className="flex justify-between">
                    <span>Joined</span>
                    <span className="font-medium text-foreground">
                      {new Date(profile.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Profile Section */}
          {activeSection === 'profile' && (
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                    <UserCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle>Profile Settings</CardTitle>
                    <CardDescription>Update your personal information.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))}
                    placeholder="Enter your email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar">Avatar URL</Label>
                  <Input
                    id="avatar"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                  />
                  {image && (
                    <div className="flex items-center gap-3 mt-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <img
                        src={image}
                        alt="Avatar preview"
                        className="h-10 w-10 rounded-full object-cover border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <span className="text-sm text-muted-foreground">Avatar preview</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-border/50 pt-6">
                <Button
                  variant="outline"
                  onClick={handleDiscard}
                  disabled={!hasChanges || saving}
                >
                  Discard
                </Button>
                <Button
                  onClick={handleSaveProfile}
                  disabled={!hasChanges || saving}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your account password. Use a strong password with at least 6 characters.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value.replace(/\s/g, ''))}
                      placeholder="Enter your current password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value.replace(/\s/g, ''))}
                      placeholder="Enter your new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-xs text-destructive">Password must be at least 6 characters.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ''))}
                      placeholder="Confirm your new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="border-t border-border/50 pt-6">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                  className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing Password...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Change Password
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

