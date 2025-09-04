import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  grade: string;

  @IsString()
  section: string;

  @IsString()
  academicYear: string;

  @IsUUID()
  teacherId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
