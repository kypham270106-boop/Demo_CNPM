import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsIn, ValidateIf, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Actor, CurrentUser, hashPassword, Operator, publicUser } from '../auth/auth.module';
import { Database } from '../common/database';
import { PageQuery, paginate } from '../common/dto';
import { conflict } from '../common/http';

class ProfileDto {
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
}
class SettingsDto {
  @ApiPropertyOptional({enum: ['vi', 'en']}) @ValidateIf((_, value) => value !== undefined) @IsIn(['vi', 'en']) language?: string;
  @ApiPropertyOptional({enum: ['light', 'dark', 'system']}) @ValidateIf((_, value) => value !== undefined) @IsIn(['light', 'dark', 'system']) theme?: string;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsBoolean() notifications?: boolean;
}
class UserQuery extends PageQuery {
  @ApiPropertyOptional({enum: Role}) @ValidateIf((_, value) => value !== undefined) @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({enum: ['true', 'false']}) @ValidateIf((_, value) => value !== undefined) @IsIn(['true', 'false']) active?: string;
}
class CreateUserDto extends ProfileDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({writeOnly: true}) @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @ApiPropertyOptional({enum: Role}) @ValidateIf((_, value) => value !== undefined) @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsString() @Length(1, 32) studentCode?: string;
}
class UpdateUserDto {
  @ApiProperty() @IsBoolean() active!: boolean;
}

@Injectable()
class UsersService {
  constructor(private readonly db: Database) {}

  profile(actor: Actor, dto: ProfileDto) {
    return this.db.user.update({where: {id: actor.id}, data: dto, select: publicUser});
  }
  settings(actor: Actor, dto: SettingsDto = {}) {
    return this.db.userSettings.upsert({
      where: {userId: actor.id}, create: {userId: actor.id, ...dto}, update: dto,
    });
  }
  async list(query: UserQuery) {
    const {q, role, active} = query;
    const where: Prisma.UserWhereInput = {
      role, active: active === undefined ? undefined : active === 'true',
      OR: q ? ['email', 'name', 'studentCode'].map(key => ({[key]: {contains: q, mode: 'insensitive'}})) : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({where, select: publicUser, ...paginate(query), orderBy: [{createdAt: 'desc'}, {id: 'asc'}]}),
      this.db.user.count({where}),
    ]);
    return {items, total, page: query.page, limit: query.limit};
  }
  async create(dto: CreateUserDto) {
    const {password, ...data} = dto;
    const passwordHash = await hashPassword(password);
    return this.db.user.create({
      data: {...data, email: dto.email.toLowerCase(), passwordHash, settings: {create: {}}},
      select: publicUser,
    });
  }
  update(actor: Actor, id: string, dto: UpdateUserDto) {
    if (id === actor.id && !dto.active) throw conflict('SELF_LOCK', 'You cannot lock your own account');
    return this.db.write(tx => tx.user.update({where: {id}, data: dto, select: publicUser}));
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('me') me(@CurrentUser() actor: Actor) { return actor; }
  @Patch('me') profile(@CurrentUser() actor: Actor, @Body() dto: ProfileDto) {
    return this.users.profile(actor, dto);
  }
  @Operator() @Get() list(@Query() query: UserQuery) { return this.users.list(query); }
  @Operator() @Post() create(@Body() dto: CreateUserDto) { return this.users.create(dto); }
  @Operator() @Patch(':id') update(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
class SettingsController {
  constructor(private readonly users: UsersService) {}
  @Get() get(@CurrentUser() actor: Actor) { return this.users.settings(actor); }
  @Patch() update(@CurrentUser() actor: Actor, @Body() dto: SettingsDto) { return this.users.settings(actor, dto); }
  @Post('reset') @HttpCode(200) reset(@CurrentUser() actor: Actor) {
    return this.users.settings(actor, {language: 'vi', theme: 'light', notifications: true});
  }
}

@Module({controllers: [UsersController, SettingsController], providers: [UsersService]})
export class UsersModule {}
