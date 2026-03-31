import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, MinLength } from 'class-validator';

class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

interface RequestWithUser extends Request {
  user: { id: string } | null;
}

// Optional JWT guard: passes through even without a token
class OptionalJwtGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override handleRequest(_err: unknown, user: any): any {
    return user ?? null;
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.usersService.searchUsers(q ?? '', limit ? parseInt(limit, 10) : 6);
  }

  @Get(':username')
  @UseGuards(OptionalJwtGuard)
  async findByUsername(
    @Param('username') username: string,
    @Request() req: RequestWithUser,
  ) {
    const requestingUserId: string | undefined = req.user?.id ?? undefined;
    return this.usersService.findByUsername(username, requestingUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Request() req: RequestWithUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(req.user!.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Request() req: RequestWithUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.updatePassword(req.user!.id, dto.current_password, dto.new_password);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':username/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(@Request() req: RequestWithUser, @Param('username') username: string) {
    await this.usersService.follow(req.user!.id, username);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':username/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(@Request() req: RequestWithUser, @Param('username') username: string) {
    await this.usersService.unfollow(req.user!.id, username);
  }
}
