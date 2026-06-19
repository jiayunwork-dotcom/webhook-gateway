import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || request.headers['x-api-key'];

    if (!authHeader) {
      throw new UnauthorizedException('API key required');
    }

    let publicKey: string;
    if (authHeader.startsWith('Bearer ')) {
      publicKey = authHeader.slice(7);
    } else if (authHeader.startsWith('ApiKey ')) {
      publicKey = authHeader.slice(7);
    } else {
      publicKey = authHeader;
    }

    return this.authService
      .validateApiKey(publicKey)
      .then(tenant => {
        request.tenant = tenant;
        return true;
      })
      .catch(() => {
        throw new UnauthorizedException('Invalid API key');
      });
  }
}
