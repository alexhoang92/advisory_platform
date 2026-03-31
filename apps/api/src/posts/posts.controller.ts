import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard';

interface RequestWithUser extends Request {
  user: { id: string } | null;
}

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  async findAll(
    @Request() req: RequestWithUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('ticker') ticker?: string,
    @Query('filter') filter?: string,
    @Query('author') author?: string,
  ) {
    const userId: string | undefined = req.user?.id ?? undefined;
    const feedFilter = (['latest', 'followed', 'trending'].includes(filter ?? '') ? filter : 'latest') as 'latest' | 'followed' | 'trending';
    return this.postsService.findAll(cursor, limit ? parseInt(limit, 10) : 20, userId, ticker, feedFilter, author);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  async findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    const userId: string | undefined = req.user?.id ?? undefined;
    return this.postsService.findOne(id, userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: RequestWithUser, @Body() dto: CreatePostDto) {
    return this.postsService.create(req.user!.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, req.user!.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async remove(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.postsService.remove(id, req.user!.id);
  }
}
