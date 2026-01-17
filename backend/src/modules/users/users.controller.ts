import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  // @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    // TODO: Implementar
    return {
      message: 'GET /me endpoint - será implementado',
      user: req.user || null,
    };
  }
}
