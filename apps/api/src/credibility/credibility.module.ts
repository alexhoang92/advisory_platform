import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CredibilityService } from './credibility.service';
import { CredibilityController } from './credibility.controller';
import { CredibilityProcessor } from './credibility.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { KolModule } from '../kol/kol.module';

@Module({
  imports: [
    PrismaModule,
    KolModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          // No Redis configured — queue operations degrade to no-op
          return { redis: { host: '127.0.0.1', port: 6379 } };
        }
        return { url: redisUrl };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'credibility' }),
  ],
  providers: [CredibilityService, CredibilityProcessor],
  controllers: [CredibilityController],
  exports: [CredibilityService],
})
export class CredibilityModule {}
