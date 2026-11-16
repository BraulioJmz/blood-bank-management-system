import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Publico, Usuario } from './decoradores';
import { LoginDto } from './login.dto';
import type { UsuarioActual } from './tipos';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  /** Datos del usuario de la sesión actual (lo usa la web al recargar). */
  @Get('yo')
  yo(@Usuario() usuario: UsuarioActual) {
    return usuario;
  }
}
