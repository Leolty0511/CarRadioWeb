import { z } from 'zod'
import { QR_LINK_TYPES } from '../models/QrLinkHub'

const externalUrlSchema = z.string().trim().min(1).max(2000).url().refine((value) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}, 'Only HTTP and HTTPS links are allowed')

const qrLinkItemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(240).default(''),
  url: externalUrlSchema,
  type: z.enum(QR_LINK_TYPES).default('website'),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(1000).default(0),
}).strict()

export const qrLinkHubInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  enabled: z.boolean().default(true),
  links: z.array(qrLinkItemSchema).max(20),
}).strict()

export const qrTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{12,32}$/)

export type QrLinkHubInput = z.infer<typeof qrLinkHubInputSchema>

export function parseQrLinkHubInput(value: unknown): QrLinkHubInput {
  return qrLinkHubInputSchema.parse(value)
}
