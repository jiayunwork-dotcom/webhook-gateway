import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [SignatureService],
  exports: [SignatureService],
})
export class SignatureModule {}
