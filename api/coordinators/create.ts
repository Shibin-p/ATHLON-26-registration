import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCreateCoordinator } from '../_lib/handlers/coordinatorHandlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleCreateCoordinator(req, res);
}
