import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAssignCoordinator } from '../lib/coordinatorHandlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAssignCoordinator(req, res);
}
