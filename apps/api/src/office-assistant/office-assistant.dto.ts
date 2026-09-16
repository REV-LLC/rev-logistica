import { z } from 'zod';

export const officeQuestionSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(8000),
  }).strict()).max(12).default([]),
}).strict();
export type OfficeQuestion = z.infer<typeof officeQuestionSchema>;
