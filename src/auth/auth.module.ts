import {
  Body, CanActivate, Controller, createParamDecorator, ExecutionContext, Get, Global,
  HttpCode, Injectable, Module, Post, Query, Req, Res, SetMetadata,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { IsEmail, IsNotEmpty, ValidateIf, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../common/config';
import { Database } from '../common/database';
import { error } from '../common/http';

const scrypt = promisify(derive);
const audience = 'smart-e-mobility-api';
export const publicUser = {
  id: true, name: true, email: true, studentCode: true, role: true, active: true, createdAt: true,
} satisfies Prisma.UserSelect;
export type Actor = Prisma.UserGetPayload<{select: typeof publicUser}>;

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(value: string, hash?: string | null) {
  const [salt, digest] = (hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await scrypt(value, salt, 64) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key) && Boolean(hash);
}

export const Public = () => SetMetadata('public', true);
export const Operator = () => SetMetadata('roles', [Role.OPERATOR]);
export const Student = () => SetMetadata('roles', [Role.STUDENT]);
type AuthRequest = Request & {actor: Actor};
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthRequest>().actor);

@Injectable()
class AccessGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: Database, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride('public', targets)) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw error(401, 'AUTH_REQUIRED', 'A bearer token is required');
    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{sub: string}>(token, { audience, algorithms: ['HS256'] }));
    } catch {
      throw error(401, 'INVALID_TOKEN', 'Token is invalid or expired');
    }
    const actor = await this.db.user.findUnique({where: {id: sub}, select: publicUser});
    if (!actor) throw error(401, 'INVALID_TOKEN', 'Account no longer exists');
    if (!actor.active) throw error(403, 'ACCOUNT_LOCKED', 'The account is locked');
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles && !roles.includes(actor.role)) throw error(403, 'FORBIDDEN', 'This role cannot perform the operation');
    request.actor = actor;
    return true;
  }
}

class LoginDto {
  @ApiProperty({ example: 'student@demo.local' })
  @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ writeOnly: true })
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

class OAuthQuery {
  @ApiProperty({required: false}) @ValidateIf((_, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(4096) code?: string;
  @ApiProperty({required: false}) @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(200) state?: string;
  @ApiProperty({required: false, name: 'error'}) @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(120) error?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(250) scope?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(30) authuser?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(80) prompt?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(250) hd?: string;
}

class SessionDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
  @ApiProperty({ example: 3600 }) expiresIn!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) user!: Actor;
}

@Injectable()
class AuthService {
  constructor(private readonly db: Database, private readonly jwt: JwtService) {}

  async session(actor: Actor): Promise<SessionDto> {
    if (!actor.active) throw error(403, 'ACCOUNT_LOCKED', 'The account is locked');
    const expiresIn = config().tokenSeconds;
    return {
      accessToken: await this.jwt.signAsync({ sub: actor.id }, { audience, expiresIn }),
      tokenType: 'Bearer', expiresIn, user: actor,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: {email: dto.email.toLowerCase()}, select: {...publicUser, passwordHash: true},
    });
    if (!(await verifyPassword(dto.password, user?.passwordHash)) || !user) {
      throw error(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    const {passwordHash, ...actor} = user;
    void passwordHash;
    return this.session(actor);
  }

  private google() {
    const {clientId, clientSecret, redirectUri} = config().google;
    if (!clientId || !clientSecret || !redirectUri) {
      throw error(503, 'OAUTH_DISABLED', 'Google sign-in is disabled');
    }
    return {client: new OAuth2Client(clientId, clientSecret, redirectUri), clientId};
  }

  async googleStart() {
    const {client} = this.google();
    const state = randomBytes(24).toString('base64url');
    const {codeVerifier, codeChallenge} = await client.generateCodeVerifierAsync();
    const cookie = await this.jwt.signAsync({state, codeVerifier}, {audience: 'google-oauth', expiresIn: 600});
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'], state, code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    return {cookie, url};
  }

  async googleFinish(query: OAuthQuery, cookie: string | undefined) {
    const {client, clientId} = this.google();
    if (!cookie || !query.state || !query.code || query.error) {
      throw error(400, 'OAUTH_REJECTED', 'Google sign-in was rejected or expired');
    }
    let state: {state: string; codeVerifier: string};
    try {
      state = await this.jwt.verifyAsync(cookie, {audience: 'google-oauth', algorithms: ['HS256']});
    } catch {
      throw error(400, 'OAUTH_REJECTED', 'Google sign-in was rejected or expired');
    }
    if (state.state !== query.state) throw error(400, 'OAUTH_REJECTED', 'OAuth state does not match');
    const profile = await (async () => {
      try {
        const {tokens} = await client.getToken({code: query.code!, codeVerifier: state.codeVerifier});
        if (!tokens.id_token) throw new Error('Missing ID token');
        return (await client.verifyIdToken({idToken: tokens.id_token, audience: clientId})).getPayload();
      } catch {
        throw error(502, 'OAUTH_PROVIDER_ERROR', 'Google identity verification failed');
      }
    })();
    if (!profile?.sub || !profile.email || !profile.email_verified) {
      throw error(401, 'OAUTH_EMAIL_UNVERIFIED', 'Google email verification is required');
    }
    const email = profile.email.toLowerCase();
    const actor = await this.db.write(async tx => {
      const existing = await tx.user.findUnique({where: {googleSub: profile.sub}, select: publicUser});
      if (existing) return existing;
      // Explicit provisioning avoids linking an existing local or operator account by email.
      if (await tx.user.findUnique({where: {email}, select: {id: true}})) {
        throw error(409, 'OAUTH_ACCOUNT_EXISTS', 'Use the sign-in method assigned to this account');
      }
      return tx.user.create({
        data: {email, name: profile.name ?? email, googleSub: profile.sub, settings: {create: {}}},
        select: publicUser,
      });
    });
    return this.session(actor);
  }
}

@ApiTags('auth')
@Controller('auth')
class AuthController {
  private readonly options = {httpOnly: true, sameSite: 'lax' as const, path: '/api/auth/google'};

  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200) @ApiOkResponse({type: SessionDto})
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Public() @Get('google')
  async google(@Res() response: Response) {
    const {cookie, url} = await this.auth.googleStart();
    response.cookie('hub_oauth', cookie, {...this.options, secure: config().secureCookies, maxAge: 600_000});
    response.redirect(url);
  }

  @Public() @Get('google/callback') @ApiOkResponse({type: SessionDto})
  callback(@Query() query: OAuthQuery, @Req() request: Request, @Res({passthrough: true}) response: Response) {
    const cookie = request.headers.cookie?.match(/(?:^|;\s*)hub_oauth=([^;]+)/)?.[1];
    response.clearCookie('hub_oauth', {...this.options, secure: config().secureCookies});
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.googleFinish(query, cookie);
  }

  @Get('me') @ApiBearerAuth()
  me(@CurrentUser() actor: Actor) { return actor; }
}

@Global()
@Module({
  imports: [JwtModule.registerAsync({useFactory: () => ({secret: config().jwtSecret})})],
  controllers: [AuthController],
  providers: [AuthService, {provide: APP_GUARD, useClass: AccessGuard}],
})
export class AuthModule {}
