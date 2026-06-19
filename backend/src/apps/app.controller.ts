import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppService } from './app.service';
import { IsString, MinLength, MaxLength, IsOptional, IsArray, IsBoolean } from 'class-validator';

class CreateAppDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  customEventTypes?: string[];
}

class UpdateAppDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  customEventTypes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Apps')
@Controller('api/apps')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new app' })
  async create(@Request() req: any, @Body() dto: CreateAppDto) {
    return this.appService.create(req.user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all apps' })
  async findAll(@Request() req: any) {
    return this.appService.findAll(req.user.tenantId);
  }

  @Get(':appId')
  @ApiOperation({ summary: 'Get app by ID' })
  async findOne(@Request() req: any, @Param('appId') appId: string) {
    return this.appService.findOne(req.user.tenantId, appId);
  }

  @Get(':appId/stats')
  @ApiOperation({ summary: 'Get app statistics' })
  async getStats(@Request() req: any, @Param('appId') appId: string) {
    return this.appService.getAppStats(req.user.tenantId, appId);
  }

  @Put(':appId')
  @ApiOperation({ summary: 'Update app' })
  async update(@Request() req: any, @Param('appId') appId: string, @Body() dto: UpdateAppDto) {
    return this.appService.update(req.user.tenantId, appId, dto);
  }

  @Delete(':appId')
  @ApiOperation({ summary: 'Delete app' })
  async remove(@Request() req: any, @Param('appId') appId: string) {
    return this.appService.remove(req.user.tenantId, appId);
  }
}
