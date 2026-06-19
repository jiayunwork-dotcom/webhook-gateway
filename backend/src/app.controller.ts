import { Controller, Get, Head } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  @Get('health')
  @Head('health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'webhook-gateway',
    };
  }

  @Get()
  @ApiOperation({ summary: 'API info' })
  root() {
    return {
      name: 'Webhook Gateway API',
      version: '1.0.0',
      description: 'Multi-tenant Webhook Event Delivery Platform',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
