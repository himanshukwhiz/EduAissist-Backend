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

  @Post('demo-login')
  async demoLogin(@Body() body: { email: string }) {
    try {
      // Find the demo user by email
      const user = await this.usersService.findByEmail(body.email);
      if (!user) {
        throw new UnauthorizedException('Demo user not found');
      }

      // Generate JWT token for demo user
      const result = await this.authService.login(user);
      return result;
    } catch (error) {
      console.error('Demo login error:', error);
      throw new UnauthorizedException('Demo login failed');
    }
  }

}
