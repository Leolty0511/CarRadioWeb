import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '@/services/apiClient'

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<any>(null)
  useEffect(() => { if (id) { apiClient.get(`/v1/content/news/${id}`, { incrementViews: true }).then((r) => r.success && setItem(r.data)) } }, [id])
  if (!item) { return <div className="max-w-4xl mx-auto px-4 py-20 text-center">正在加载文章...</div> }
  return <article className="max-w-4xl mx-auto px-4 py-14"><header className="mb-8"><p className="text-sm text-blue-600 mb-3">{item.category}</p><h1 className="text-4xl font-bold mb-4">{item.title}</h1><p className="text-slate-500">{new Date(item.createdAt).toLocaleDateString('zh-CN')} · {item.author}</p></header>{item.thumbnail && <img src={item.thumbnail} alt={item.title} className="w-full max-h-[480px] object-cover rounded-xl mb-8" />}<div className="prose prose-lg max-w-none whitespace-pre-wrap">{item.content || item.summary}</div></article>
}
