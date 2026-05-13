import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';
import Resume from '@/models/Resume';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Domain ID → MongoDB domain field mapping
const DOMAIN_ID_MAP: Record<string, string> = {
  'frontend':    'frontend',
  'backend':     'backend',
  'fullstack':   'fullstack',
  'data_science':'data_science',
  'devops':      'devops',
  'product':     'product',
  'design':      'design',
  'qa':          'qa',
};

async function getRandomMockQuestion(domain: string): Promise<string> {
  try {
    await connectDB();
    const col = mongoose.connection.collection('questions');
    const dbDomain = DOMAIN_ID_MAP[domain] ?? domain;

    // Get a random question for this domain
    const docs = await col.find({ domain: dbDomain }).toArray();
    if (docs.length > 0) {
      const random = docs[Math.floor(Math.random() * docs.length)];
      return random.question as string;
    }
  } catch (err) {
    console.warn('MongoDB fallback failed, using generic question:', err);
  }
  // Last resort generic fallback
  return 'Tell me about yourself and your experience in this field.';
}

interface HistoryEntry {
  question: string;
  answer: string;
}

export async function POST(req: NextRequest) {
  const { domain, difficulty, interviewType, history = [], questionNumber = 1, resumeText, resumeId } = await req.json();

  if (!domain || !difficulty) {
    return NextResponse.json({ error: 'Missing domain or difficulty' }, { status: 400 });
  }

  // --- PRE-GENERATED POOL LOGIC (Disabled for strict level-based questioning) ---
  /* 
  if (resumeId) {
    ...
  }
  */

  // No API key — use MongoDB questions directly
  if (process.env.USE_MOCK_QUESTIONS === 'true' || !process.env.GEMINI_API_KEY) {
    console.log('>>> Using Fallback question from DB (Manual Mock Mode)');
    const q = await getRandomMockQuestion(domain);
    return NextResponse.json({ question: q, isMock: true });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const typeContext = interviewType === 'dsa'
      ? 'Technical interview: DSA, algorithms, system design.'
      : 'Behavioral interview: STAR method, situational judgment.';

    const isFirstQuestion = (history as HistoryEntry[]).length === 0;
    const lastExchange = !isFirstQuestion
      ? (history as HistoryEntry[])[(history as HistoryEntry[]).length - 1]
      : null;

    const resumeContext = resumeText
      ? `\n\nCandidate's resume excerpt:\n"""\n${resumeText.slice(0, 2000)}\n"""\nPersonalize your questions based on the specific skills, projects, and experience mentioned.`
      : '';

    const prompt = isFirstQuestion
      ? `You are an expert technical interviewer for a ${difficulty}-level ${domain} role. ${typeContext}${resumeContext}
Ask a short, direct opening question to start the interview. Keep it to 1-2 sentences. Return ONLY the question.`
      : `You are an expert technical interviewer for a ${difficulty}-level ${domain} role. ${typeContext}${resumeContext}

Last exchange:
Q: ${lastExchange!.question}
A: ${lastExchange!.answer || '(no answer)'}

Ask question ${questionNumber} as a short follow-up. Probe a specific technical detail or project from their previous answer. 
Keep the question punchy and realistic (max 2 sentences). Return ONLY the question.`;

    console.log(`>>> Using Gemini API for question generation (Q${questionNumber})`);
    const result = await model.generateContent(prompt);
    const question = result.response.text()
      .trim()
      .replace(/^(Question\s*\d*[:.]?\s*|Interviewer:\s*|Q:\s*)/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    return NextResponse.json({ question, isMock: false });
  } catch (err: any) {
    console.error('>>> GEMINI ERROR DETAILS:', {
      message: err?.message,
      status: err?.status,
      stack: err?.stack?.split('\n')[0]
    });
    
    // Always fallback to mock questions on ANY Gemini error for a smooth user experience
    console.warn('Gemini failed. Falling back to MongoDB mock questions.');
    const q = await getRandomMockQuestion(domain);
    return NextResponse.json({ question: q, isMock: true, debugError: err?.message });
  }
}
