import { Controller, Get, Post, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReplayService, CreateReplayTaskDto } from './replay.service';
import { ReplayTaskStatus } from '../entities/replay-task.entity';

@ApiTags('Replay')
@Controller('api/replays')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  @Post()
  @ApiOperation({ summary: '创建回放任务' })
  async createTask(@Request() req: any, @Body() dto: CreateReplayTaskDto) {
    return this.replayService.createTask(req.user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取回放任务列表' })
  async listTasks(
    @Request() req: any,
    @Query('status') status?: ReplayTaskStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.replayService.listTasks(
      req.user.tenantId,
      status,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取回放任务详情' })
  async getTaskDetail(@Request() req: any, @Param('id') id: string) {
    return this.replayService.getTaskDetail(req.user.tenantId, id);
  }

  @Post(':id/retry-failed')
  @ApiOperation({ summary: '重试任务中的失败项' })
  async retryFailed(@Request() req: any, @Param('id') id: string) {
    return this.replayService.retryFailedItems(req.user.tenantId, id);
  }
}
