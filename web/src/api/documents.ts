import { apiFetch } from './client';
import type { Document } from './types';

export function listDocuments(tradeId: string): Promise<Document[]> {
  return apiFetch<Document[]>(`/trades/${tradeId}/documents`);
}

export function uploadDocument(
  tradeId: string,
  category: string,
  documentType: string,
  file: File,
): Promise<Document> {
  const formData = new FormData();
  formData.append('category', category);
  formData.append('document_type', documentType);
  formData.append('file', file);
  return apiFetch<Document>(`/trades/${tradeId}/documents`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
}
