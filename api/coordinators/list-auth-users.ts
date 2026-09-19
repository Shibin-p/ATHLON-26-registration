import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleListAuthUsers } from '../_lib/handlers/coordinatorHandlers.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleListAuthUsers(req, res);
}
