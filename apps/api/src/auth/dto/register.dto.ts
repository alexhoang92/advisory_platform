import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username may only contain letters, numbers, and underscores',
  })
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  display_name!: string;

  @IsIn(['expert', 'retail'])
  role!: 'expert' | 'retail';
}
