import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.usersRepo.create(createUserDto as any);
    const saved = await this.usersRepo.save(user as any);
    return saved as User;
  }

  async findAll(): Promise<User[]> {
    return this.usersRepo.find({
      where: { isActive: true },
      relations: ['classes', 'createdExams', 'evaluations'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id, isActive: true },
      relations: ['classes', 'createdExams', 'evaluations'],
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email, isActive: true } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { googleId, isActive: true } });
  }

  async findByMicrosoftId(microsoftId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { microsoftId, isActive: true } });
  }

  async findTeachers(): Promise<User[]> {
    return this.usersRepo.find({ where: { role: UserRole.TEACHER, isActive: true } });
  }

  async findAdmins(): Promise<User[]> {
    return this.usersRepo.find({ where: { role: UserRole.ADMIN, isActive: true } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateUserDto);
    const saved = await this.usersRepo.save(user as any);
    return saved as User;
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    user.isActive = false;
    await this.usersRepo.save(user);
  }

  async createOrUpdateOAuthUser(oauthData: {
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    googleId?: string;
    microsoftId?: string;
  }): Promise<User> {
    const user = await this.findByEmail(oauthData.email);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update OAuth data for existing user
    if (oauthData.googleId) user.googleId = oauthData.googleId;
    if (oauthData.microsoftId) user.microsoftId = oauthData.microsoftId;
    if (oauthData.avatar) user.avatar = oauthData.avatar;
    
    return this.usersRepo.save(user);
  }
}
