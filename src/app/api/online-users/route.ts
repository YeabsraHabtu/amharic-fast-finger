import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getActiveUserCount, recordActivity } from "@/lib/activeTracker"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const visitorId = searchParams.get("visitorId") || req.headers.get("x-visitor-id")
    if (visitorId) {
      recordActivity(visitorId, false)
    }

    // Active real-time guests + typing users
    const liveTrackerCount = getActiveUserCount()

    // Also check database for registered users active in last 5 minutes
    let dbCount = 0
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      dbCount = await prisma.user.count({
        where: {
          lastActiveAt: {
            gte: fiveMinutesAgo
          }
        }
      })
    } catch {
      // Postgres fallback
    }

    // Return the accurate live count (minimum 1 when someone visits)
    const totalCount = Math.max(1, Math.max(liveTrackerCount, dbCount))

    return NextResponse.json({ count: totalCount })
  } catch (error) {
    console.error("ONLINE_USERS_ERROR", error)
    return NextResponse.json({ count: 1 })
  }
}
