import { z } from 'zod';

export const UpdateUserSchema = z.object({
  display_name: z.string().min(1).max(64).optional(),
  bio: z.string().max(1000).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  website: z.string().url('Invalid URL').optional().nullable(),
  avatar_url: z.string().url('Invalid URL').optional().nullable(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
