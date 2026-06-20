import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '../config/config.module';

export interface DeliveryNotification {
  eventType: string;
  endpointName: string;
  status: 'success' | 'failed' | 'timeout';
  responseStatus?: number;
  durationMs: number;
  timestamp: string;
}

@Injectable()
@WebSocketGateway({
  path: '/ws',
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['websocket'],
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private tenantSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Notification Gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      this.logger.warn(`WebSocket connection rejected: no token provided (socket: ${client.id})`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.jwtSecret,
      });

      const tenantId: string = payload.tenantId;
      if (!tenantId) {
        this.logger.warn(`WebSocket connection rejected: invalid token payload (socket: ${client.id})`);
        client.emit('error', { message: 'Invalid token' });
        client.disconnect(true);
        return;
      }

      client.data.tenantId = tenantId;
      client.data.email = payload.email;

      if (!this.tenantSockets.has(tenantId)) {
        this.tenantSockets.set(tenantId, new Set());
      }
      this.tenantSockets.get(tenantId)!.add(client.id);

      this.logger.log(`WebSocket connected: tenant=${tenantId}, socket=${client.id}`);

      client.emit('welcome', {
        message: 'WebSocket connection established',
        tenantId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.logger.warn(`WebSocket connection rejected: ${err.message} (socket: ${client.id})`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const tenantId = client.data?.tenantId;
    if (tenantId) {
      const sockets = this.tenantSockets.get(tenantId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.tenantSockets.delete(tenantId);
        }
      }
      this.logger.log(`WebSocket disconnected: tenant=${tenantId}, socket=${client.id}`);
    }
  }

  sendDeliveryNotification(tenantId: string, notification: DeliveryNotification): boolean {
    const sockets = this.tenantSockets.get(tenantId);
    if (!sockets || sockets.size === 0) {
      return false;
    }

    this.server.to(Array.from(sockets)).emit('delivery_notification', notification);
    return true;
  }

  isTenantOnline(tenantId: string): boolean {
    const sockets = this.tenantSockets.get(tenantId);
    return !!sockets && sockets.size > 0;
  }
}
