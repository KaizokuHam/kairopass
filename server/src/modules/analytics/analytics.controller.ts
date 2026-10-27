import type { RequestHandler } from 'express';
import { analyticsReport } from './analytics.service.js';
import { analyticsEventId, parseAnalyticsQuery } from './analytics.validation.js';
import { ApiError } from '../../lib/api-error.js';
export const report: RequestHandler = async (req, res) => {
  const query = parseAnalyticsQuery(req.query);
  if (req.params.eventId) {
    if (query.eventId) throw new ApiError(400, 'INVALID_ANALYTICS_QUERY', 'Choose one event scope.');
    query.eventId = analyticsEventId(req.params.eventId);
  }
  const output = await analyticsReport(req.auth!.user.id, query, req.path !== '/events');
  res.json({ success: true, data: req.path === '/trends' ? { scope: output.scope, trends: output.trends } : req.path === '/events' ? { scope: output.scope, events: output.events, pagination: output.pagination } : output });
};
