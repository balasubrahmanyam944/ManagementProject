import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'

/**
 * GET /api/custom-boards/users
 * Get all users in the tenant for assignee selection
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await db.findAllUsers()
    // Return only safe fields
    const safeUsers = users.map(u => ({
      id: u._id.toString(),
      name: u.name || u.email,
      email: u.email,
      image: u.image,
      role: u.role,
    }))

    return NextResponse.json({ success: true, users: safeUsers })
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

