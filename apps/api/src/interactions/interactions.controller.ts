import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InteractionsService } from './interactions.service';

interface RequestWithUser extends Request {
  user: { id: string };
}

@Controller('posts/:postId')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  // ─── Likes ──────────────────────────────────────────────────────────────────

  @Post('like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  toggleLike(@Request() req: RequestWithUser, @Param('postId') postId: string) {
    return this.interactionsService.likePost(req.user.id, postId);
  }

  // ─── Saves ──────────────────────────────────────────────────────────────────

  @Post('save')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  toggleSave(@Request() req: RequestWithUser, @Param('postId') postId: string) {
    return this.interactionsService.savePost(req.user.id, postId);
  }

  // ─── Replies ─────────────────────────────────────────────────────────────────

  @Get('replies')
  getReplies(@Param('postId') postId: string) {
    return this.interactionsService.getReplies(postId);
  }

  @Post('replies')
  @UseGuards(JwtAuthGuard)
  createReply(
    @Request() req: RequestWithUser,
    @Param('postId') postId: string,
    @Body() body: { body: string },
  ) {
    return this.interactionsService.createReply(req.user.id, postId, body);
  }

  @Delete('replies/:replyId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  deleteReply(@Request() req: RequestWithUser, @Param('replyId') replyId: string) {
    return this.interactionsService.deleteReply(req.user.id, replyId);
  }
}
