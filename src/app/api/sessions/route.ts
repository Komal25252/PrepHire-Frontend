import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import InterviewSession from '@/models/InterviewSession';
import { auth } from '@/auth';

// GET /api/sessions — fetch all sessions for the logged-in user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const sessions = await InterviewSession.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(sessions);
}

// POST /api/sessions — save a completed interview session
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { sessionId, domain, difficulty, score, duration, date } = body;

  if (!sessionId || !domain || !difficulty || score === undefined || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  await connectDB();

  // Upsert — safe to call multiple times for the same session
  const saved = await InterviewSession.findOneAndUpdate(
    { sessionId },
    {
      userId: session.user.id,
      sessionId,
      domain,
      difficulty,
      score,
      duration: duration || '—',
      status: 'completed',
      date,
    },
    { upsert: true, new: true }
  );

  return NextResponse.json(saved, { status: 201 });
}
