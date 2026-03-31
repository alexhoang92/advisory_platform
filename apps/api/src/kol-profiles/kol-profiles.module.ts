import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KolProfilesController } from './kol-profiles.controller';
import { KolProfilesService } from './kol-profiles.service';
import { KolModule } from '../kol/kol.module';

@Module({
  imports: [ScheduleModule, KolModule],
  controllers: [KolProfilesController],
  providers: [KolProfilesService],
  exports: [KolProfilesService],
})
export class KolProfilesModule {}
