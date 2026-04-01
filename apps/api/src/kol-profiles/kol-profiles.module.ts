import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KolProfilesController } from './kol-profiles.controller';
import { KolProfilesService } from './kol-profiles.service';
import { KolModule } from '../kol/kol.module';
import { CredibilityModule } from '../credibility/credibility.module';

@Module({
  imports: [ScheduleModule, KolModule, CredibilityModule],
  controllers: [KolProfilesController],
  providers: [KolProfilesService],
  exports: [KolProfilesService],
})
export class KolProfilesModule {}
