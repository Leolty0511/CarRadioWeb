/**
 * FAQ API Service
 */

import { apiClient } from './apiClient';

export interface FAQItem {
  _id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  published: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export type FAQCreateData = Pick<FAQItem, 'question' | 'answer' | 'category' | 'sortOrder' | 'published' | 'language'>;

/**
 * Public: get published FAQs
 */
export async function getPublishedFAQs(language: string): Promise<FAQItem[]> {
  const res = await apiClient.get('/faq', { language });
  return res.success ? (res.data ?? []) : [];
}

/**
 * Admin: get all FAQs
 */
export async function getAdminFAQs(language: string): Promise<FAQItem[]> {
  const res = await apiClient.get('/faq/admin', { language });
  return res.success ? (res.data ?? []) : [];
}

/**
 * Admin: create FAQ
 */
export async function createFAQ(data: FAQCreateData): Promise<FAQItem | null> {
  const res = await apiClient.post('/faq', data);
  return res.success ? res.data : null;
}

/**
 * Admin: update FAQ
 */
export async function updateFAQ(id: string, data: Partial<FAQItem>): Promise<FAQItem | null> {
  const res = await apiClient.put(`/faq/${id}`, data);
  return res.success ? res.data : null;
}

/**
 * Admin: delete FAQ
 */
export async function deleteFAQ(id: string): Promise<boolean> {
  const res = await apiClient.delete(`/faq/${id}`);
  return res.success;
}

export async function exportAdminFAQs(): Promise<{ language: string; items: FAQCreateData[] }> {
  const res = await apiClient.get('/faq/admin/export');
  if (!res.success || !res.data) {
    throw new Error(res.error || 'export_failed');
  }
  return res.data;
}

export async function importAdminFAQs(
  items: FAQCreateData[],
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ imported: number; skipped: number }> {
  const res = await apiClient.post('/faq/admin/import', { items, mode });
  if (!res.success) {
    throw new Error(res.error || 'import_failed');
  }
  return res.data;
}
