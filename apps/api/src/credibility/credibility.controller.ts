import { Controller, Get, Param, Post } from '@nestjs/common';
import { CredibilityService } from './credibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('users')
export class CredibilityController {
  constructor(
    private readonly credibilityService: CredibilityService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /api/v1/users/:username/credibility — public, no auth required */
  @Get(':username/credibility')
  async getCredibility(@Param('username') username: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException(`User @${username} not found`);
    if (user.role !== 'expert') return null;
    return this.credibilityService.getForExpert(user.id);
  }

  /** POST /api/v1/users/:username/credibility/recompute — dev/admin trigger */
  @Post(':username/credibility/recompute')
  async recompute(@Param('username') username: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException(`User @${username} not found`);
    if (user.role !== 'expert') throw new NotFoundException('User is not an expert');
    return this.credibilityService.computeForExpert(user.id);
  }
}
