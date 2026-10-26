import type { RequestHandler } from 'express';
import { getPublicEvent, listPublicEvents } from './discovery.service.js';
import { parseDiscoveryQuery, parsePublicEventId } from './discovery.validation.js';

export const list: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await listPublicEvents(parseDiscoveryQuery(req.query)) });
};
export const get: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { event: await getPublicEvent(parsePublicEventId(req.params.id)) } });
};
