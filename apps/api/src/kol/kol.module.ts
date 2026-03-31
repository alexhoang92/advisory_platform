import { Module } from '@nestjs/common';
import { KolController } from './kol.controller';
import { KolService } from './kol.service';

@Module({
  controllers: [KolController],
  providers: [KolService],
  exports: [KolService],
})
export class KolModule {}
