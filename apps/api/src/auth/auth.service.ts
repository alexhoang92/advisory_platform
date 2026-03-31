import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthResponse, User as DomainUser } from '@hamilton/shared';
import { RefreshTokenSchema } from '@hamilton/shared';
import * as bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

// Prisma User shape (defined locally to avoid pre-generation issues)
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
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) {
      throw new ConflictException('Email is already in use');
    }

    const existingUsername = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const createData = {
      email: dto.email,
      password_hash,
      username: dto.username,
      display_name: dto.username,
      role: dto.role,
      ...(dto.role === 'expert' && {
        expert_profile: {
          create: {
            specializations: [] as string[],
            subscription_price_monthly: 0,
            credibility_score: 0,
            total_followers: 0,
            win_rate: 0,
            avg_return: 0,
          },
        },
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.create as (args: any) => Promise<PrismaUser>)({
      data: createData,
    });

    return this.buildAuthResponse(user);
  }

  async validateUser(email: string, password: string): Promise<PrismaUser | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<PrismaUser | null>)({
      where: { email },
    });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return null;

    return user;
  }

  async login(user: PrismaUser): Promise<AuthResponse> {
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<PrismaUser | null>)({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.buildAuthResponse(user);
  }

  async getMe(userId: string): Promise<DomainUser> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma.user.findUnique as (args: any) => Promise<PrismaUser | null>)({
      where: { id: userId },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return this.serializeUser(user);
  }

  private buildAuthResponse(user: PrismaUser): AuthResponse {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const access_token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    });

    return {
      user: this.serializeUser(user),
      access_token,
      refresh_token,
    };
  }

  private serializeUser(user: PrismaUser): DomainUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      role: user.role as DomainUser['role'],
      bio: user.bio,
      location: user.location,
      website: user.website,
      stripe_account_id: user.stripe_account_id,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    };
  }
}

// Re-export for use in guards
export type { PrismaUser };
