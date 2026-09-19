import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCreateCoordinator } from '../lib/coordinatorHandlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleCreateCoordinator(req, res);
}
