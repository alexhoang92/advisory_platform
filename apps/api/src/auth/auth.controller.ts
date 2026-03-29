import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenSchema } from '@hamilton/shared';

interface RequestWithUser extends Request {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Request() req: RequestWithUser) {
    return this.authService.login(req.user as Parameters<AuthService['login']>[0]);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown) {
    const parsed = RefreshTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return this.authService.refresh(parsed.data.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: RequestWithUser) {
    return this.authService.getMe((req.user as { id: string }).id);
  }
}
