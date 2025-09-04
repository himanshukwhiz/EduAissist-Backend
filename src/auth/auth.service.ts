import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string): Promise<User | null> {
    return this.usersService.findByEmail(email);
  }

  async login(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async googleLogin(req: any) {
    const { user: oauthUser } = req;
    
    // Check if user exists in our database
    const existingUser = await this.usersService.findByEmail(oauthUser.email);
    
    if (!existingUser) {
      throw new UnauthorizedException('User not authorized to access this platform');
    }
    
    // Update OAuth data for existing user
    const user = await this.usersService.createOrUpdateOAuthUser({
      email: oauthUser.email,
      firstName: oauthUser.firstName,
      lastName: oauthUser.lastName,
      avatar: oauthUser.avatar,
      googleId: oauthUser.googleId,
    });

    return this.login(user);
  }

  async microsoftLogin(req: any) {
    const { user: oauthUser } = req;
    
    // Check if user exists in our database
    const existingUser = await this.usersService.findByEmail(oauthUser.email);
    
    if (!existingUser) {
      throw new UnauthorizedException('User not authorized to access this platform');
    }
    
    // Update OAuth data for existing user
    const user = await this.usersService.createOrUpdateOAuthUser({
      email: oauthUser.email,
      firstName: oauthUser.firstName,
      lastName: oauthUser.lastName,
      microsoftId: oauthUser.microsoftId,
    });

    return this.login(user);
  }

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }
}
