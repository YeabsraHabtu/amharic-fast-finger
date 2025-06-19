import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { recordActivity } from "@/lib/activeTracker"

export async function POST(req: Request) {
  try {
    const session = await auth()
    const body = await req.json().catch(() => ({}))
    const visitorId = body.visitorId || req.headers.get("x-visitor-id") || session?.user?.email || "anonymous_user"
    const isTyping = Boolean(body.isTyping)

    // Record real-time activity for both guests and authenticated users
    recordActivity(visitorId, isTyping, session?.user?.email || undefined)

    // If authenticated, also persist last active timestamp in Postgres
    if (session?.user?.email) {
      await prisma.user.update({
        where: { email: session.user.email },
        data: { lastActiveAt: new Date() }
      }).catch(err => {
        console.error("Prisma user update error:", err)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("HEARTBEAT_ERROR", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
