import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '@/services/apiClient'

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<any>(null)
  useEffect(() => { if (id) { apiClient.get(`/products/${id}`).then((r) => r.success && setProduct(r.data)) } }, [id])
  if (!product) { return <div className="max-w-5xl mx-auto px-4 py-20 text-center">正在加载产品...</div> }
  const images = (product.images || []).map((i: any) => typeof i === 'string' ? i : i.url).filter(Boolean)
  if (product.image && !images.includes(product.image)) { images.unshift(product.image) }
  return <main className="max-w-6xl mx-auto px-4 py-12 space-y-10">
    <section className="grid md:grid-cols-2 gap-10 items-start">
      <div className="space-y-4">{images.length ? images.map((url: string) => <img key={url} src={url} alt={product.title} className="w-full max-h-[520px] object-contain rounded-lg bg-slate-50" />) : <div className="h-80 bg-slate-100 rounded-lg" />}</div>
      <div><p className="text-sm text-blue-600 mb-2">{product.category}</p><h1 className="text-4xl font-bold mb-5">{product.title}</h1><p className="text-lg text-slate-600 whitespace-pre-wrap">{product.description}</p></div>
    </section>
    {product.features?.length > 0 && <section><h2 className="text-2xl font-semibold mb-4">产品特点</h2><ul className="grid md:grid-cols-2 gap-3">{product.features.filter(Boolean).map((f: string) => <li key={f} className="p-4 bg-slate-50 rounded-lg">{f}</li>)}</ul></section>}
  </main>
}
