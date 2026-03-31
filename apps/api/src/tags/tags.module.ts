import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { KolModule } from '../kol/kol.module';

@Module({
  imports: [ScheduleModule, KolModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
