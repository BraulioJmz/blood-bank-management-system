import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._]{3,50}$/, { message: 'Usuario inválido' })
  username!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
