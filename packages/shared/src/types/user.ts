import { z } from 'zod';

// User roles
export const UserRole = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// User schema
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum([UserRole.USER, UserRole.ADMIN]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

// User creation
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// User login
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// User update
export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(128).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Session
export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type Session = z.infer<typeof sessionSchema>;
