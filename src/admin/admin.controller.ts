import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, CreateCustomerDto, UpdateCustomerDto } from './admin.dto';
import type { Request } from 'express';

/**
 * AdminController
 * ───────────────
 * Routes:
 *   POST   /api/admin/login                  → login (returns JWT)
 *   GET    /api/admin/dashboard              → aggregate dashboard stats
 *   GET    /api/admin/customers              → list all customers
 *   POST   /api/admin/customers              → create customer
 *   GET    /api/admin/customers/:slug        → get customer detail
 *   PUT    /api/admin/customers/:slug        → update customer
 *   DELETE /api/admin/customers/:slug        → delete customer
 *   PATCH  /api/admin/customers/:slug/toggle → enable/disable customer
 *   GET    /api/admin/customers/:slug/analytics → per-customer analytics
 */
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  // ──────────────────────────────────────────────
  // Authentication
  // ──────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.adminService.login(dto);
  }

  // ──────────────────────────────────────────────
  // Dashboard
  // ──────────────────────────────────────────────

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ──────────────────────────────────────────────
  // Customer Management
  // ──────────────────────────────────────────────

  @Get('customers')
  @UseGuards(JwtAuthGuard)
  async listCustomers() {
    return this.adminService.listCustomers();
  }

  @Post('customers')
  @UseGuards(JwtAuthGuard)
  async createCustomer(@Body() dto: CreateCustomerDto, @Req() req: Request) {
    // Vercel/proxies pass 'https' in x-forwarded-proto. Fallback to req.protocol for local dev.
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    // Force https if domain contains vercel.app or ngrok to be robust
    const secureProto = (host?.includes('vercel.app') || host?.includes('ngrok.app') || host?.includes('ngrok-free.app')) ? 'https' : proto;
    const baseUrl = `${secureProto}://${host}`;
    return this.adminService.createCustomer(dto, baseUrl);
  }

  @Get('customers/:slug')
  @UseGuards(JwtAuthGuard)
  async getCustomer(@Param('slug') slug: string) {
    return this.adminService.getCustomer(slug);
  }

  @Put('customers/:slug')
  @UseGuards(JwtAuthGuard)
  async updateCustomer(
    @Param('slug') slug: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.adminService.updateCustomer(slug, dto);
  }

  @Delete('customers/:slug')
  @UseGuards(JwtAuthGuard)
  async deleteCustomer(@Param('slug') slug: string) {
    return this.adminService.deleteCustomer(slug);
  }

  @Patch('customers/:slug/toggle')
  @UseGuards(JwtAuthGuard)
  async toggleCustomer(@Param('slug') slug: string) {
    return this.adminService.toggleCustomer(slug);
  }

  @Get('customers/:slug/analytics')
  @UseGuards(JwtAuthGuard)
  async getCustomerAnalytics(@Param('slug') slug: string) {
    return this.adminService.getCustomerAnalytics(slug);
  }

  @Get('customers/:slug/fs-pair-stats')
  @UseGuards(JwtAuthGuard)
  async getFsPairStats(@Param('slug') slug: string) {
    return this.adminService.getFsPairStats(slug);
  }
}
