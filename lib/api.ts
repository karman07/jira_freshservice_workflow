import type {
  DashboardResponse,
  Customer,
  CreateCustomerPayload,
  CustomerAnalyticsResponse,
  FsPairStats,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function headers(): HeadersInit {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('intell_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!BASE) {
    throw new Error('NEXT_PUBLIC_API_URL is not set. Please add it to .env.local');
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...((init.headers as Record<string, string>) ?? {}) },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('intell_token');
      localStorage.removeItem('intell_email');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { message?: string })?.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; email: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getDashboard: () => req<DashboardResponse>('/admin/dashboard'),

  listCustomers: () => req<Customer[]>('/admin/customers'),

  getCustomer: (slug: string) => req<Customer>(`/admin/customers/${slug}`),

  createCustomer: (data: CreateCustomerPayload) =>
    req<Customer>('/admin/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCustomer: (slug: string, data: Partial<CreateCustomerPayload>) =>
    req<Customer>(`/admin/customers/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCustomer: (slug: string) =>
    req<{ deleted: boolean }>(`/admin/customers/${slug}`, {
      method: 'DELETE',
    }),

  toggleCustomer: (slug: string) =>
    req<Customer>(`/admin/customers/${slug}/toggle`, {
      method: 'PATCH',
    }),

  getCustomerAnalytics: (slug: string) =>
    req<CustomerAnalyticsResponse>(`/admin/customers/${slug}/analytics`),

  /** Fetch FS↔FS pair mapping stats for a customer */
  getFsPairStats: (slug: string) =>
    req<FsPairStats>(`/admin/customers/${slug}/fs-pair-stats`),
};
