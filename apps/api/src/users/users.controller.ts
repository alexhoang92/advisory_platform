import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
  user: { id: string };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.usersService.searchUsers(q ?? '', limit ? parseInt(limit, 10) : 6);
  }

  @Get(':username')
  async findByUsername(@Param('username') username: string) {
    return this.usersService.findByUsername(username);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Request() req: RequestWithUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Request() req: RequestWithUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.updatePassword(req.user.id, dto.current_password, dto.new_password);
  }
}
