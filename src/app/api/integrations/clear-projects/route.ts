import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Mark all projects as inactive for the user
    const projects = await db.findProjectsByUserId(session.user.id)
    let updatedCount = 0
    
    for (const project of projects) {
      await db.updateProject(project._id.toString(), { isActive: false })
      updatedCount++
    }

    return NextResponse.json({ 
      success: true, 
      message: `Marked ${updatedCount} projects as inactive`,
      updatedCount: updatedCount
    })
  } catch (error) {
    console.error('Error clearing projects:', error)
    return NextResponse.json({ error: 'Failed to clear projects' }, { status: 500 })
  }
} 