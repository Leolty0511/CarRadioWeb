import express, { Request, Response } from 'express';
import User from '../models/User';
import DocumentView from '../models/DocumentView';
import BaseDocument from '../models/Document';
import AIUsage from '../models/AIUsage';
import Member from '../models/Member';
import SearchEvent from '../models/SearchEvent';
import { createLogger } from '../utils/logger';
import { requirePermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/permissions';

const logger = createLogger('admin-route');

const router = express.Router();

// 获取用户统计
router.get('/users/stats', requirePermission(PERMISSIONS.pages.dashboard), async (req: Request, res: Response) => {
  try {
    const total = await User.countDocuments();
    res.json({ success: true, data: { total } });
  } catch (error) {
    logger.error({ error }, '获取用户统计失败');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : '获取统计失败' 
    });
  }
});

// 获取访问统计
router.get('/analytics/views', requirePermission(PERMISSIONS.pages.dashboard), async (req: Request, res: Response) => {
  try {
    const total = await DocumentView.countDocuments();
    res.json({ success: true, data: { total } });
  } catch (error) {
    logger.error({ error }, '获取访问统计失败');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : '获取统计失败' 
    });
  }
});

router.get('/analytics/content', requirePermission(PERMISSIONS.pages.dashboard), async (_req, res) => {
  try {
    const [viewGroups, aiStats, memberStats, noResultSearches] = await Promise.all([
      DocumentView.aggregate([
        { $group: { _id: '$documentId', views: { $sum: 1 }, uniqueViewers: { $addToSet: '$viewerFingerprint' } } },
        { $sort: { views: -1 } }, { $limit: 10 },
      ]),
      AIUsage.aggregate([{ $group: { _id: null, total: { $sum: '$messageCount' }, successful: { $sum: { $cond: ['$success', '$messageCount', 0] } }, tokens: { $sum: '$tokenCount' } } }]),
      Member.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: -1 } }, { $limit: 30 }]),
      SearchEvent.aggregate([{ $match: { resultCount: 0 } }, { $group: { _id: '$query', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } }, { $sort: { count: -1, lastAt: -1 } }, { $limit: 20 }]),
    ])
    const documents = await BaseDocument.find({ _id: { $in: viewGroups.map(group => group._id) } }).select('title documentType').lean()
    const titleMap = new Map(documents.map((document: any) => [String(document._id), document]))
    res.json({ success: true, data: {
      popularDocuments: viewGroups.map(group => ({ documentId: String(group._id), title: titleMap.get(String(group._id))?.title || '已删除文档', views: group.views, uniqueViewers: group.uniqueViewers.length })),
      ai: { total: aiStats[0]?.total || 0, successful: aiStats[0]?.successful || 0, tokens: aiStats[0]?.tokens || 0 },
      memberGrowth: memberStats.reverse(),
      noResultSearches: noResultSearches.map(item => ({ query: item._id, count: item.count, lastAt: item.lastAt })),
    } })
  } catch (error) {
    logger.error({ error }, 'Failed to load content analytics')
    res.status(500).json({ success: false, error: 'content_analytics_failed' })
  }
})

export default router;
