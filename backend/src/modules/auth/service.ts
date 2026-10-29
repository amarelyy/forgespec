import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppContext } from '../../context';
import { many, one } from '../../db/pool';
import { conflict, notFound, unauthorized, unprocessable } from '../../lib/errors';
import { newId, newToken, sha256 } from '../../lib/ids';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, created_at: u.created_at });

async function issueTokens(ctx: AppContext, user: UserRow) {
  const access_token = jwt.sign({ email: user.email, name: user.name }, ctx.config.jwtSecret, {
    subject: user.id,
    expiresIn: ctx.config.accessTokenTtl as any,
  });
  const refresh_token = newToken();
  const expires = new Date(Date.now() + ctx.config.refreshTokenTtlDays * 86_400_000);
  await ctx.db.query('insert into refresh_tokens (id, user_id, token_hash, expires_at) values ($1,$2,$3,$4)', [newId(), user.id, sha256(refresh_token), expires.toISOString()]);
  return { access_token, refresh_token, token_type: 'Bearer' as const, user: publicUser(user) };
}

export async function register(ctx: AppContext, input: { email: string; name: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (await one(ctx.db, 'select id from users where email = $1', [email])) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const hash = await bcrypt.hash(input.password, 10);
  const rows = await many<UserRow>(ctx.db, 'insert into users (id, email, name, password_hash) values ($1,$2,$3,$4) returning *', [newId(), email, input.name.trim(), hash]);
  return issueTokens(ctx, rows[0]);
}

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('forgespec-dummy', 10);

export async function login(ctx: AppContext, input: { email: string; password: string }) {
  const user = await one<UserRow>(ctx.db, 'select * from users where email = $1', [input.email.trim().toLowerCase()]);
  const ok = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  return issueTokens(ctx, user);
}

/** Rotate: the presented refresh token is revoked and a new pair is issued. */
export async function refresh(ctx: AppContext, token: string) {
  const row = await one<{ id: string; user_id: string; expires_at: string; revoked: boolean }>(
    ctx.db,
    'select id, user_id, expires_at, revoked from refresh_tokens where token_hash = $1',
    [sha256(token)],
  );
  if (!row || row.revoked || new Date(row.expires_at) < new Date()) throw unauthorized('Invalid or expired refresh token');
  await ctx.db.query('update refresh_tokens set revoked = true where id = $1', [row.id]);
  const user = await one<UserRow>(ctx.db, 'select * from users where id = $1', [row.user_id]);
  if (!user) throw unauthorized();
  return issueTokens(ctx, user);
}

export async function logout(ctx: AppContext, token: string) {
  await ctx.db.query('update refresh_tokens set revoked = true where token_hash = $1', [sha256(token)]);
}

export async function getProfile(ctx: AppContext, id: string) {
  const user = await one<UserRow>(ctx.db, 'select * from users where id = $1', [id]);
  if (!user) throw notFound('User');
  return publicUser(user);
}

export async function updateProfile(ctx: AppContext, id: string, input: { name?: string; current_password?: string; new_password?: string }) {
  const user = await one<UserRow>(ctx.db, 'select * from users where id = $1', [id]);
  if (!user) throw notFound('User');
  let hash = user.password_hash;
  if (input.new_password) {
    if (!input.current_password || !(await bcrypt.compare(input.current_password, user.password_hash))) {
      throw unprocessable('WRONG_PASSWORD', 'Current password is incorrect');
    }
    hash = await bcrypt.hash(input.new_password, 10);
  }
  const rows = await many<UserRow>(ctx.db, 'update users set name = $2, password_hash = $3 where id = $1 returning *', [id, input.name?.trim() ?? user.name, hash]);
  if (input.new_password) await ctx.db.query('update refresh_tokens set revoked = true where user_id = $1', [id]);
  return publicUser(rows[0]);
}
