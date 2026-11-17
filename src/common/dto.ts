import { Type } from 'class-transformer';
import { IsInt, IsISO8601, ValidateIf, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { error } from './http';

export class PageQuery {
  @ApiPropertyOptional({default: 1, minimum: 1, maximum: 100000})
  @ValidateIf((_, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({default: 25, minimum: 1, maximum: 100})
  @ValidateIf((_, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(120) q?: string;
}

export function paginate({page, limit}: PageQuery) {
  return {skip: (page - 1) * limit, take: limit};
}

export class WindowDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d\d:\d\d)$/) startsAt!: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d\d:\d\d)$/) endsAt!: string;
}

export function windowDates(dto: WindowDto) {
  const startsAt = new Date(dto.startsAt);
  const endsAt = new Date(dto.endsAt);
  if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 7 * 86400_000) {
    throw error(400, 'INVALID_WINDOW', 'The window must be positive and at most seven days');
  }
  return { startsAt, endsAt };
}
