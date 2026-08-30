/**
 * 路由配置文件
 * 统一管理所有路由，避免重复定义
 */

import { lazy, ComponentType } from 'react';

// 路由级懒加载
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const KnowledgeLanding = lazy(() => import('@/pages/knowledge/KnowledgeLanding'));
const VehicleData = lazy(() => import('@/pages/knowledge/VehicleData'));
const VideoTutorials = lazy(() => import('@/pages/knowledge/VideoTutorials'));
const DeviceOperationVideoTutorials = lazy(() => import('@/pages/knowledge/DeviceOperationVideoTutorials'));
const Tutorials = lazy(() => import('@/pages/knowledge/Tutorials'));
const CANBusSettings = lazy(() => import('@/pages/knowledge/CANBusSettings'));
const DocumentDetail = lazy(() => import('@/pages/DocumentDetail'));
const Articles = lazy(() => import('@/pages/Articles'));
const Categories = lazy(() => import('@/pages/Categories'));
const Contact = lazy(() => import('@/pages/Contact'));
const Forum = lazy(() => import('@/pages/Forum'));
const FAQ = lazy(() => import('@/pages/FAQ'));
const Feedback = lazy(() => import('@/pages/Feedback'));
const AudioEqualizerPage = lazy(() => import('@/pages/AudioEqualizer'));
const AudioGeneratorPage = lazy(() => import('@/pages/AudioGenerator'));
const SoftwareDownloads = lazy(() => import('@/pages/SoftwareDownloads'));
const SoftwareDownloadDetail = lazy(() => import('@/pages/SoftwareDownloadDetail'));
const UserManual = lazy(() => import('@/pages/UserManual'));
const UserManualDetail = lazy(() => import('@/pages/UserManualDetail'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Disclaimer = lazy(() => import('@/pages/Disclaimer'));
const NewsletterUnsubscribe = lazy(() => import('@/pages/NewsletterUnsubscribe'));
const MemberAccess = lazy(() => import('@/pages/MemberAccess'));
const MemberProfile = lazy(() => import('@/pages/MemberProfile'));

// 企业官网页面
const Products = lazy(() => import('@/pages/Products'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const News = lazy(() => import('@/pages/News'));
const NewsDetail = lazy(() => import('@/pages/NewsDetail'));
const Resources = lazy(() => import('@/pages/Resources'));
const About = lazy(() => import('@/pages/About'));
const Quality = lazy(() => import('@/pages/Quality'));

// UI展示页面
const UIShowcase = lazy(() => import('@/pages/UIShowcase'));

// 管理后台和404
const Admin = lazy(() => import('@/pages/admin'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export interface RouteConfig {
  path: string;
  component: ComponentType;
  index?: boolean;
  protected?: boolean;
}

/**
 * 公共路由配置
 * 所有语言版本共享此配置
 */
export const commonRoutes: RouteConfig[] = [
  { path: '', component: Dashboard, index: true },
  { path: 'knowledge', component: KnowledgeLanding, protected: true },
  { path: 'knowledge/vehicle-data', component: VehicleData, protected: true },
  { path: 'knowledge/video-tutorials', component: VideoTutorials, protected: true },
  { path: 'knowledge/device-operation-videos', component: DeviceOperationVideoTutorials, protected: true },
  { path: 'knowledge/tutorials', component: Tutorials, protected: true },
  { path: 'knowledge/canbus-settings', component: CANBusSettings, protected: true },
  { path: 'knowledge/:type/:id', component: DocumentDetail, protected: true },
  { path: 'faq', component: FAQ },
  { path: 'feedback', component: Feedback },
  { path: 'forum', component: Forum },
  { path: 'articles', component: Articles },
  { path: 'categories', component: Categories },
  { path: 'audio-equalizer', component: AudioEqualizerPage },
  { path: 'audio-generator', component: AudioGeneratorPage },
  { path: 'contact', component: Contact },
  { path: 'software-downloads', component: SoftwareDownloads, protected: true },
  { path: 'software-downloads/:slug', component: SoftwareDownloadDetail, protected: true },
  { path: 'user-manual', component: UserManual, protected: true },
  { path: 'user-manual/:slug', component: UserManualDetail, protected: true },
  { path: 'products', component: Products },
  { path: 'products/:id', component: ProductDetail },
  { path: 'news', component: News },
  { path: 'news/:id', component: NewsDetail },
  { path: 'resources', component: Resources },
  { path: 'about', component: About },
  { path: 'quality', component: Quality },
  { path: 'ui-showcase', component: UIShowcase },
  { path: 'privacy', component: Privacy },
  { path: 'terms', component: Terms },
  { path: 'disclaimer', component: Disclaimer },
  { path: 'newsletter/unsubscribe', component: NewsletterUnsubscribe },
  { path: 'login', component: MemberAccess },
  { path: 'profile', component: MemberProfile, protected: true },
];

/**
 * 支持的语言列表
 */
export const supportedLanguages = ['en', 'zh', ''] as const;

export type SupportedLanguage = typeof supportedLanguages[number];

/**
 * 管理后台路由配置
 */
export const adminRoutes = [
  '/admin',
  '/zh/admin',
];

/**
 * 导出组件
 */
export const routeComponents = {
  Admin,
  NotFound,
};
