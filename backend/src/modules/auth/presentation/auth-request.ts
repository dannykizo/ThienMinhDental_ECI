import type { Request } from 'express';
import type { AuthenticatedUserView } from '../application/auth.service.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUserView;
}
