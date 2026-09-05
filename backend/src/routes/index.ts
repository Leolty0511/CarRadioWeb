/**
 * API v1 路由聚合器 (P1-07)
 * 
 * 提供 /api/v1 前缀的版本控制路由
 * 便于未来 Breaking Changes 时的平滑迁移
 * 
 * 当前策略：
 * - /api/* 和 /api/v1/* 同时可用（向后兼容）
 * - 建议新功能优先使用 /api/v1/*
 * - 未来可标记 /api/* 为 deprecated
 */

import { Router } from 'express';
import uploadRouter from './upload';
import aiRouter from './ai';
import documentsRouter from './documents';
import imagesRouter from './images';
import softwareRouter from './software';
import contactRouter from './contact';
import adminRouter from './admin';
import audioRouter from './audio';
import feedbackRouter from './feedback';
import documentFeedbackRouter from './documentFeedback';
import draftsRouter from './drafts';
import audioPresetsRouter from './audioPresets';
import systemRouter from './system';
import siteSettingsRouter from './siteSettings';
import categoryRouter from './categoryRoutes';
import announcementRouter from './announcement';
import canbusSettingsRouter from './canbusSettings';
import vehiclesRouter from './vehicles';
import systemConfigRouter from './systemConfig';
import resourceLinksRouter from './resourceLinks';
import siteImagesRouter from './siteImages';
import languageRouter from './language';
import productsRouter from './products';
import heroBannersRouter from './heroBanners';
import seoSettingsRouter from './seoSettings';
import faqRouter from './faq';
import searchRouter from './search';
import userManualRouter from './userManual';
import pageContentRouter from './pageContent';
import visitorsRouter from './visitors';
import oauthRouter from './oauth';
import usersRouter from './users';
import auditLogsRouter from './auditLogs';
import legalVersionsRouter from './legalVersions';
import newsletterRouter from './newsletter';
import tokenRefreshRouter from './tokenRefresh';
import configRouter from './config/configRoutes';
import forumRouter from './forum';
import securityRouter from './security';
import { authenticateUser } from '../middleware/auth';
import { authenticateContentAccess, authenticateContentOrGuideView } from '../middleware/contentAccess';

const router = Router();

// Establish the CSRF cookie for long-lived admin pages before their first
// state-changing request.
router.get('/csrf-token', (_req, res) => {
  res.json({ success: true })
})

// ==================== 公开路由 (无需认证) ====================

// OAuth 认证
router.use('/auth', oauthRouter);

// Token 刷新 (P0-04: 双 Token 机制)
router.use('/auth', tokenRefreshRouter);

// 数据展示路由
router.use('/documents', authenticateContentOrGuideView, documentsRouter);
router.use('/images', imagesRouter);
router.use('/software', authenticateContentAccess, softwareRouter);
router.use('/vehicles', authenticateContentOrGuideView, vehiclesRouter);
router.use('/categories', authenticateContentOrGuideView, categoryRouter);
router.use('/announcement', announcementRouter);
router.use('/language', languageRouter);
router.use('/products', productsRouter);
router.use('/hero-banners', heroBannersRouter);
router.use('/seo', seoSettingsRouter);
router.use('/faq', faqRouter);
router.use('/search', searchRouter);
router.use('/user-manual', authenticateContentOrGuideView, userManualRouter);
router.use('/page-content', pageContentRouter);
router.use('/resource-links', resourceLinksRouter);
router.use('/site-settings', siteSettingsRouter);
router.use('/legal-versions', legalVersionsRouter);
router.use('/newsletter', newsletterRouter);
router.use('/config', configRouter);
router.use('/forum', forumRouter);

// CANBus 设置
router.use('/canbus-settings', authenticateContentOrGuideView, canbusSettingsRouter);

// 网站图片配置
router.use('/site-images', siteImagesRouter);

// 公开提交
router.use('/feedback', feedbackRouter);
router.use('/document-feedback', documentFeedbackRouter);
router.use('/contact', contactRouter);

// 访客统计
router.use('/visitors', visitorsRouter);

// AI 路由
router.use('/ai', aiRouter);

// ==================== 受保护路由 (需要认证) ====================

router.use('/users', authenticateUser, usersRouter);
router.use('/audit-logs', authenticateUser, auditLogsRouter);
router.use('/security', securityRouter);
router.use('/upload', authenticateUser, uploadRouter);
router.use('/admin', authenticateUser, adminRouter);
router.use('/audio', authenticateUser, audioRouter);
router.use('/drafts', authenticateUser, draftsRouter);
router.use('/audio-presets', authenticateUser, audioPresetsRouter);
router.use('/system', authenticateUser, systemRouter);
router.use('/system-config', authenticateUser, systemConfigRouter);

export default router;
