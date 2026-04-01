import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { InteractionsModule } from '../interactions/interactions.module';

@Module({
  imports: [
    InteractionsModule,
    BullModule.registerQueue({ name: 'credibility' }),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
