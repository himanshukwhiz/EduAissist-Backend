
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedUsers();
    } catch (error) {
      this.logger.error('Seed failed', error as any);
    }
  }

  private async seedUsers(): Promise<void> {
    const existingAdmin = await this.usersRepo.findOne({
      where: { email: 'admin@eduaissist.com' },
    });
    if (!existingAdmin) {
      const admin = this.usersRepo.create({
        email: 'admin@eduaissist.com',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        isActive: true,
      });
      await this.usersRepo.save(admin);
      this.logger.log('Seeded default admin user');
    }

    const existingTeacher = await this.usersRepo.findOne({
      where: { email: 'teacher@eduaissist.com' },
    });
    if (!existingTeacher) {
      const teacher = this.usersRepo.create({
        email: 'teacher@eduaissist.com',
        firstName: 'John',
        lastName: 'Smith',
        role: UserRole.TEACHER,
        isActive: true,
      });
      await this.usersRepo.save(teacher);
      this.logger.log('Seeded default teacher user');
    }
  }
}


