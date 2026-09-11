/**
 * 系统配置模型
 * 用于管理钉钉机器人、阿里云OSS等第三方服务配置
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// Notification channel type union
export type NotificationChannelType = 'dingtalk' | 'wecom' | 'feishu' | 'serverchan' | 'smtp' | 'webhook';

export interface NotificationEventSettings {
  memberRegistration: boolean;
  knowledgeFeedback: boolean;
}

// Dingtalk robot config
export type DingtalkMessageStyle = 'markdown' | 'actionCard' | 'link';

export interface DingtalkConfig {
  webhook: string;
  secret: string;
  enabled: boolean;
  /** Defaults to markdown for configs saved before message styles were added. */
  messageStyle?: DingtalkMessageStyle;
  /** Public HTTP(S) image used by ActionCard and Link messages. */
  imageUrl?: string;
}

// WeCom (企业微信) robot config
export interface WecomConfig {
  webhook: string;
  enabled: boolean;
}

// Feishu group robot config
export interface FeishuConfig {
  webhook: string;
  /** Optional signing secret configured in the robot security settings */
  secret?: string;
  enabled: boolean;
}

// ServerChan config (supports both ServerChan3 and Turbo)
export interface ServerChanConfig {
  /** ServerChan3: uid from SendKey page; Turbo: leave empty */
  uid: string;
  sendKey: string;
  enabled: boolean;
}

// SMTP email config
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  enabled: boolean;
}

// Generic webhook config
export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers: string;
  bodyTemplate: string;
  enabled: boolean;
}

// Alibaba Cloud OSS config
export interface OSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  enabled: boolean;
}

// Union of all notification channel configs
export type NotificationConfig = DingtalkConfig | WecomConfig | FeishuConfig | ServerChanConfig | SmtpConfig | WebhookConfig;

export type ForumNotificationChannelType = 'wecom' | 'dingtalk' | 'serverchan' | 'email' | 'webhook';

export interface ForumNotificationSettings {
  enabled: boolean;
  locale: 'en' | 'zh-hans';
  timezone: string;
  skipAdminMod: boolean;
  channels: {
    wecom: WecomConfig;
    dingtalk: DingtalkConfig;
    serverchan: ServerChanConfig;
    email: {
      enabled: boolean;
      recipients: string;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    };
    webhook: { enabled: boolean; url: string; method: 'POST' | 'PUT'; headers: string };
  };
}

// All config types stored in system_configs collection
export type SystemConfigType = NotificationChannelType | 'notification_events' | 'forum_notification' | 'oss';

// System config document interface
export interface ISystemConfig extends Document {
  configType: SystemConfigType;
  config: NotificationConfig | NotificationEventSettings | ForumNotificationSettings | OSSConfig;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// Static methods interface
export interface ISystemConfigModel extends Model<ISystemConfig> {
  getConfig(configType: SystemConfigType): Promise<NotificationConfig | NotificationEventSettings | ForumNotificationSettings | OSSConfig | null>;
  updateConfig(
    configType: SystemConfigType,
    newConfig: NotificationConfig | NotificationEventSettings | ForumNotificationSettings | OSSConfig,
    updatedBy?: string
  ): Promise<ISystemConfig>;
}

const VALID_CONFIG_TYPES: SystemConfigType[] = ['dingtalk', 'wecom', 'feishu', 'serverchan', 'smtp', 'webhook', 'notification_events', 'forum_notification', 'oss'];

const SystemConfigSchema = new Schema<ISystemConfig>({
  configType: {
    type: String,
    required: true,
    enum: VALID_CONFIG_TYPES,
    unique: true
  },
  config: {
    type: Schema.Types.Mixed,
    required: true
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  collection: 'system_configs'
});

// Static method: get config
SystemConfigSchema.statics.getConfig = async function(configType: SystemConfigType) {
  const config = await this.findOne({ configType });
  return config?.config || null;
};

// Static method: update config (upsert)
SystemConfigSchema.statics.updateConfig = async function(
  configType: SystemConfigType,
  newConfig: NotificationConfig | NotificationEventSettings | ForumNotificationSettings | OSSConfig,
  updatedBy: string = 'system'
) {
  const result = await this.findOneAndUpdate(
    { configType },
    { config: newConfig, updatedBy },
    { new: true, upsert: true, runValidators: true }
  );
  return result;
};

const SystemConfig = mongoose.model<ISystemConfig, ISystemConfigModel>('SystemConfig', SystemConfigSchema);

export default SystemConfig;
