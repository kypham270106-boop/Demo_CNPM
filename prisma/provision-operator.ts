import 'reflect-metadata';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { isEmail } from 'class-validator';
import { hashPassword } from '../src/auth/auth.module';

const db = new PrismaClient();

async function provision() {
  const email = process.env.BOOTSTRAP_OPERATOR_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_OPERATOR_NAME?.trim();
  const password = process.env.BOOTSTRAP_OPERATOR_PASSWORD;
  if (!email || !isEmail(email) || email.length > 254 || !name || name.length > 120 ||
    !password || password.length < 16 || password.length > 128) {
    throw new Error('Provide a valid operator email, a name, and a password of 16–128 characters');
  }
  await db.user.create({
    data: {email, name, passwordHash: await hashPassword(password), role: 'OPERATOR', settings: {create: {}}},
  });
  console.log('Operator account created');
}

void provision().catch((failure: unknown) => {
  const duplicate = failure instanceof Error && 'code' in failure && failure.code === 'P2002';
  console.error(duplicate ? 'Operator email already exists' : 'Operator provisioning failed. Check inputs and database access.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
