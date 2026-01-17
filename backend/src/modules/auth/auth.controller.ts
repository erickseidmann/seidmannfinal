import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: { email: string; password: string }) {
    // TODO: Implementar login
    return {
      message: 'Login endpoint - será implementado',
      data: loginDto,
    };
  }

  @Post('register')
  async register(@Body() registerDto: any) {
    // TODO: Apenas admin pode registrar novos usuários
    // Implementar validação de role ADMIN
    return {
      message: 'Register endpoint - será implementado (apenas admin)',
      data: registerDto,
    };
  }

  @Get('me')
  // @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    // TODO: Implementar autenticação JWT
    return {
      message: 'GET /me endpoint - será implementado',
      user: req.user || null,
    };
  }
}
