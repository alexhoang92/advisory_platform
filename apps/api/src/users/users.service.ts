import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User as DomainUser } from '@hamilton/shared';
import * as bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

interface PrismaUser {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  stripe_account_id: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(
    q: string,
    limit = 6,
  ): Promise<Array<Pick<DomainUser, 'id' | 'username' | 'display_name' | 'avatar_url'>>> {
    const term = q.trim();
    if (!term) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = await (this.prisma.user.findMany as (args: any) => Promise<PrismaUser[]>)({
      where: {
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { display_name: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: Math.min(limit, 20),
      select: { id: true, username: true, display_name: true, avatar_url: true },
    });

    return users as Array<Pick<DomainUser, 'id' | 'username' | 'display_name' | 'avatar_url'>>;
  }

  async findByUsername(username: string): Promise<DomainUser & { expert_profile?: unknown }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<(PrismaUser & { expert_profile?: unknown }) | null>)({
      where: { username },
      include: { expert_profile: true },
    });

    if (!user) {
      throw new NotFoundException(`User @${username} not found`);
    }

    return this.serializeUser(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<DomainUser> {
    const updateData: Record<string, unknown> = {};
    if (dto.display_name !== undefined) updateData['display_name'] = dto.display_name;
    if (dto.bio !== undefined) updateData['bio'] = dto.bio;
    if (dto.location !== undefined) updateData['location'] = dto.location;
    if (dto.website !== undefined) updateData['website'] = dto.website;
    if (dto.avatar_url !== undefined) updateData['avatar_url'] = dto.avatar_url;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.update as (args: any) => Promise<PrismaUser>)({
      where: { id: userId },
      data: updateData,
    });

    return this.serializeUser(user);
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<PrismaUser | null>)({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new UnauthorizedException('Current password is incorrect');

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.prisma.user.update as (args: any) => Promise<PrismaUser>)({
      where: { id: userId },
      data: { password_hash },
    });
  }

  private serializeUser(user: PrismaUser & { expert_profile?: unknown }): DomainUser & { expert_profile?: unknown } {
    const { password_hash: _password, expert_profile, ...rest } = user;
    void _password;
    return {
      ...rest,
      role: user.role as DomainUser['role'],
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
      ...(expert_profile !== undefined && { expert_profile }),
    };
  }
}
