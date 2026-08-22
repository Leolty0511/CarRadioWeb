/**
 * 知识库图片文件名和缩略图地址工具。
 */

export const KNOWLEDGE_IMAGE_FOLDER = 'images/knowledge/'

export function sanitizeKnowledgeImageStem(name: string): string {
  const baseName = name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return baseName || 'knowledge-image'
}

export function getKnowledgeThumbnailKey(key: string): string {
  return key.replace(/\.webp$/i, '-thumb.webp')
}
