import { Controller, Get, Post, UseGuards, Request, Redirect, Body, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private usersService: UsersService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @Redirect()
  async googleAuthCallback(@Request() req) {
    try {
      const result = await this.authService.googleLogin(req);
      
      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return {
        url: `${frontendUrl}/auth/callback?token=${result.access_token}`,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // Redirect to unauthorized page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return {
          url: `${frontendUrl}/auth/callback?error=unauthorized`,
        };
      }
      throw error;
    }
  }

  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftAuth() {
    // Initiates Microsoft OAuth flow
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  @Redirect()
  async microsoftAuthCallback(@Request() req) {
    try {
      const result = await this.authService.microsoftLogin(req);
      
      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return {
        url: `${frontendUrl}/auth/callback?token=${result.access_token}`,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // Redirect to unauthorized page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return {
          url: `${frontendUrl}/auth/callback?error=unauthorized`,
        };
      }
      throw error;
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    // JWT tokens are stateless, so logout is handled on the client side
    return { message: 'Logged out successfully' };
  }

  @Post('test-login')
  async testLogin(@Body() body: { userType: 'admin' | 'teacher' }) {
    // Server-side demo login that maps to real DB users so profile works
    const isAdmin = body?.userType === 'admin';
    const email = isAdmin ? 'admin@eduaissist.com' : 'teacher@eduaissist.com';
    const firstName = isAdmin ? 'Admin' : 'John';
    const lastName = isAdmin ? 'User' : 'Smith';

    let user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: 'User not authorized' };
      // user = await this.usersService.create({
      //   email,
      //   firstName,
      //   lastName,
      //   role: (isAdmin ? 'admin' : 'teacher') as any,
      //   isActive: true,
      // } as any);
    }

    return this.authService.login(user);
  }

  @Post('test-unauthorized-login')
  async testUnauthorizedLogin(@Body() body: { email: string }) {
    // Test endpoint to simulate unauthorized user login
    const user = await this.usersService.findByEmail(body.email);
    
    if (!user) {
      throw new UnauthorizedException('User not authorized to access this platform');
    }
    
    return this.authService.login(user);
  }
}
