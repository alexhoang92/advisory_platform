import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredibilityService } from '../credibility/credibility.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly credibilityService: CredibilityService,
  ) {}

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

  async findByUsername(username: string, requestingUserId?: string): Promise<DomainUser> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<(PrismaUser & {
      expert_profile?: unknown;
      claimed_kol_profile?: unknown;
      _count: { follows_received: number; follows_given: number };
    }) | null>)({
      where: { username },
      include: {
        expert_profile: true,
        claimed_kol_profile: true,
        _count: {
          select: {
            follows_received: true,
            follows_given: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User @${username} not found`);
    }

    let is_following = false;
    if (requestingUserId && requestingUserId !== user.id) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: requestingUserId,
            following_id: user.id,
          },
        },
      });
      is_following = follow !== null;
    }

    const serialized = this.serializeUser(user, is_following);

    // Attach credibility for expert users (cached path — never computes inline)
    if (user.role === 'expert') {
      serialized.credibility = await this.credibilityService.getForExpert(user.id);
    }

    return serialized;
  }

  async follow(followerId: string, targetUsername: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) throw new NotFoundException(`User @${targetUsername} not found`);
    if (target.id === followerId) throw new BadRequestException('Cannot follow yourself');

    try {
      await this.prisma.follow.create({
        data: { follower_id: followerId, following_id: target.id },
      });
    } catch {
      // Unique constraint violation = already following, treat as no-op
      throw new ConflictException('Already following this user');
    }
  }

  async unfollow(followerId: string, targetUsername: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) throw new NotFoundException(`User @${targetUsername} not found`);

    await this.prisma.follow.deleteMany({
      where: { follower_id: followerId, following_id: target.id },
    });
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<DomainUser> {
    const updateData: Record<string, unknown> = {};
    if (dto.display_name !== undefined) updateData['display_name'] = dto.display_name;
    if (dto.bio !== undefined) updateData['bio'] = dto.bio;
    if (dto.location !== undefined) updateData['location'] = dto.location;
    if (dto.website !== undefined) updateData['website'] = dto.website;
    if (dto.avatar_url !== undefined) updateData['avatar_url'] = dto.avatar_url;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.update as (args: any) => Promise<any>)({
      where: { id: userId },
      data: updateData,
      include: {
        _count: {
          select: { follows_received: true, follows_given: true },
        },
      },
    }) as PrismaUser & { _count: { follows_received: number; follows_given: number } };

    return this.serializeUser(user, false);
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

  private serializeUser(
    user: PrismaUser & {
      expert_profile?: unknown;
      claimed_kol_profile?: unknown;
      _count?: { follows_received: number; follows_given: number };
    },
    is_following: boolean,
  ): DomainUser {
    const { password_hash: _password, expert_profile, claimed_kol_profile, _count, ...rest } = user as PrismaUser & {
      expert_profile?: unknown;
      claimed_kol_profile?: unknown;
      _count?: { follows_received: number; follows_given: number };
    };
    void _password;
    return {
      ...rest,
      role: user.role as DomainUser['role'],
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
      follower_count: _count?.follows_received ?? 0,
      following_count: _count?.follows_given ?? 0,
      is_following,
      ...(expert_profile !== undefined && { expert_profile }),
      ...(claimed_kol_profile !== undefined && { kol_profile: claimed_kol_profile }),
    } as DomainUser;
  }
}
