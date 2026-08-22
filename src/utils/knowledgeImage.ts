/**
 * 知识库图片地址工具。
 *
 * 知识库图片上传后会生成：
 *   image.webp
 *   image-thumb.webp
 *
 * 旧图片或其他业务模块的图片保持原地址，不会被误改。
 */
export function getKnowledgeImageThumbnailUrl(url?: string | null): string {
  if (!url || !url.includes('/images/knowledge/')) {
    return url || ''
  }
  return url.replace(/\.webp(?=([?#]|$))/i, '-thumb.webp')
}
