import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleListAuthUsers } from '../lib/coordinatorHandlers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleListAuthUsers(req, res);
}
