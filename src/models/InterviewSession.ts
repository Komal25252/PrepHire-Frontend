import mongoose, { Schema, models } from 'mongoose';

const InterviewSessionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    domain: { type: String, required: true },
    difficulty: { type: String, required: true },
    score: { type: Number, required: true },
    duration: { type: String, default: '—' },
    status: { type: String, enum: ['completed', 'in_progress'], default: 'completed' },
    date: { type: String, required: true },
  },
  { timestamps: true }
);

const InterviewSession =
  models.InterviewSession || mongoose.model('InterviewSession', InterviewSessionSchema);

export default InterviewSession;
