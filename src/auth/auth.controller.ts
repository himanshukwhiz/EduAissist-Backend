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

}
