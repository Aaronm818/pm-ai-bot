import { Controller, Post, Get, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { UserService, AuthResult } from './user.service';

interface RegisterDto {
  name: string;
  email: string;
  password: string;
  role?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly userService: UserService) {
    this.logger.log('Auth Controller initialized');
  }

  /**
   * Check if Dataverse is configured for user storage
   */
  @Get('status')
  async getStatus(): Promise<{ configured: boolean; message: string }> {
    const configured = await this.userService.isDataverseConfigured();
    return {
      configured,
      message: configured 
        ? 'Dataverse user storage is configured' 
        : 'Dataverse user storage not configured. Using local storage fallback.',
    };
  }

  /**
   * Register a new user
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto): Promise<AuthResult> {
    this.logger.log(`📝 Registration attempt: ${dto.email}`);
    
    const result = await this.userService.register(
      dto.name,
      dto.email,
      dto.password,
      dto.role || 'Team Member'
    );

    if (result.success) {
      this.logger.log(`✅ Registration successful: ${dto.email}`);
    } else {
      this.logger.warn(`❌ Registration failed: ${dto.email} - ${result.error}`);
    }

    return result;
  }

  /**
   * Login user
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    this.logger.log(`🔐 Login attempt: ${dto.email}`);
    
    const result = await this.userService.login(dto.email, dto.password);

    if (result.success) {
      this.logger.log(`✅ Login successful: ${dto.email}`);
    } else {
      this.logger.warn(`❌ Login failed: ${dto.email} - ${result.error}`);
    }

    return result;
  }

  /**
   * Get all users (admin endpoint)
   */
  @Get('users')
  async getUsers(): Promise<{ users: any[]; count: number }> {
    const users = await this.userService.getAllUsers();
    return {
      users,
      count: users.length,
    };
  }
}
