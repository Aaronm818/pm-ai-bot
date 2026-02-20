import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface User {
  id?: string;
  name: string;
  email: string;
  role: string;
  passwordHash?: string;
  createdAt?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  // Use existing AI Tasks table (already has permissions!)
  // Users are identified by cr48f_project = 'PM_AI_USER'
  private readonly tableName = 'cr48f_aitaskses';
  private readonly USER_MARKER = 'PM_AI_USER';

  constructor(private readonly configService: ConfigService) {
    this.logger.log('User Service initialized (using AI Tasks table)');
  }

  /**
   * Hash password using SHA-256
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Verify password against hash
   */
  private verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Get Dataverse access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tenantId = this.configService.get<string>('DATAVERSE_TENANT_ID');
    const clientId = this.configService.get<string>('DATAVERSE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('DATAVERSE_CLIENT_SECRET');
    const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', `${dataverseUrl}/.default`);
    params.append('grant_type', 'client_credentials');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);
    
    return this.accessToken;
  }

  /**
   * Check if Dataverse is configured (AI Tasks table accessible)
   */
  async isDataverseConfigured(): Promise<boolean> {
    try {
      const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');
      if (!dataverseUrl) return false;

      const token = await this.getAccessToken();
      const url = `${dataverseUrl}/api/data/v9.2/${this.tableName}?$top=1`;
      
      this.logger.log(`🔍 Checking AI Tasks table for user storage...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        this.logger.log(`✅ AI Tasks table accessible - user storage ready!`);
        return true;
      }
      
      this.logger.log(`❌ AI Tasks table not accessible: ${response.status}`);
      return false;
    } catch (error) {
      this.logger.warn(`Dataverse not configured: ${error.message}`);
      return false;
    }
  }

  /**
   * Register a new user
   */
  async register(name: string, email: string, password: string, role: string = 'Team Member'): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Validate inputs
    if (!name || name.trim().length < 2) {
      return { success: false, error: 'Name must be at least 2 characters' };
    }
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    try {
      // Check if user already exists
      const existingUser = await this.findUserByEmail(normalizedEmail);
      if (existingUser) {
        return { success: false, error: 'An account with this email already exists' };
      }

      // Create user in Dataverse (using AI Tasks table)
      const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');
      const token = await this.getAccessToken();

      // Store user data in AI Tasks columns:
      // cr48f_task = "[USER] name" (marker prefix to identify user records)
      // cr48f_requirements = JSON with email, passwordHash, role, type
      // cr48f_datetime = created timestamp
      // NOTE: cr48f_project is a Choice field (int), so we can't use it for text markers
      const userData = {
        cr48f_task: `[USER] ${name.trim()}`,
        cr48f_requirements: JSON.stringify({
          type: this.USER_MARKER,
          email: normalizedEmail,
          passwordHash: this.hashPassword(password),
          role: role.trim() || 'Team Member',
        }),
        cr48f_datetime: new Date().toISOString(),
      };

      this.logger.log(`📝 Creating user: ${normalizedEmail}`);

      const response = await fetch(`${dataverseUrl}/api/data/v9.2/${this.tableName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to create user: ${response.status} - ${errorText}`);
        return { success: false, error: 'Failed to create account. Please try again.' };
      }

      this.logger.log(`✅ User registered: ${normalizedEmail}`);

      const user: User = {
        name: name.trim(),
        email: normalizedEmail,
        role: role.trim() || 'Team Member',
        createdAt: new Date().toISOString(),
      };

      return { success: true, user };

    } catch (error) {
      this.logger.error(`Registration error: ${error.message}`);
      return { success: false, error: 'Registration failed. Please try again.' };
    }
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const user = await this.findUserByEmail(normalizedEmail);
      
      if (!user) {
        return { success: false, error: 'No account found with this email' };
      }

      if (!user.passwordHash || !this.verifyPassword(password, user.passwordHash)) {
        return { success: false, error: 'Incorrect password' };
      }

      this.logger.log(`✅ User logged in: ${normalizedEmail}`);

      // Return user without password hash
      const safeUser: User = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      };

      return { success: true, user: safeUser };

    } catch (error) {
      this.logger.error(`Login error: ${error.message}`);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  /**
   * Find user by email (searches AI Tasks where task starts with [USER])
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');
      const token = await this.getAccessToken();

      // Filter: task starts with [USER] 
      const filter = `startswith(cr48f_task, '[USER]')`;
      const url = `${dataverseUrl}/api/data/v9.2/${this.tableName}?$filter=${encodeURIComponent(filter)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (!data.value || data.value.length === 0) {
        return null;
      }

      // Find the user with matching email in requirements JSON
      for (const record of data.value) {
        try {
          const requirements = JSON.parse(record.cr48f_requirements || '{}');
          if (requirements.email === email.toLowerCase().trim() && requirements.type === this.USER_MARKER) {
            // Extract name by removing [USER] prefix
            const name = record.cr48f_task.replace('[USER] ', '');
            return {
              id: record.cr48f_aitasksid,
              name: name,
              email: requirements.email,
              role: requirements.role || 'Team Member',
              passwordHash: requirements.passwordHash,
              createdAt: record.cr48f_datetime,
            };
          }
        } catch (e) {
          // Skip records with invalid JSON
          continue;
        }
      }

      return null;

    } catch (error) {
      this.logger.error(`Find user error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all users (for admin purposes)
   */
  async getAllUsers(): Promise<User[]> {
    try {
      const dataverseUrl = this.configService.get<string>('DATAVERSE_URL');
      const token = await this.getAccessToken();

      const filter = `startswith(cr48f_task, '[USER]')`;
      const url = `${dataverseUrl}/api/data/v9.2/${this.tableName}?$filter=${encodeURIComponent(filter)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      
      return (data.value || []).map((record: any) => {
        try {
          const requirements = JSON.parse(record.cr48f_requirements || '{}');
          if (requirements.type !== this.USER_MARKER) return null;
          
          const name = record.cr48f_task.replace('[USER] ', '');
          return {
            id: record.cr48f_aitasksid,
            name: name,
            email: requirements.email,
            role: requirements.role || 'Team Member',
            createdAt: record.cr48f_datetime,
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

    } catch (error) {
      this.logger.error(`Get all users error: ${error.message}`);
      return [];
    }
  }
}
