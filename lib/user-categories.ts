import { create } from 'zustand';

import { readApiError } from './api-error';
import { resolveCategory } from './categories';
import { API_BASE_URL } from './transactions';

export type CategoryType = 'expense' | 'income';

export type CustomCategories = Record<CategoryType, string[]>;

const emptyCategories: CustomCategories = { expense: [], income: [] };

/** The list a form's type picks from. Anything that is not income is an expense. */
export const categoryTypeOf = (type?: string | null): CategoryType =>
  type?.toLowerCase() === 'income' ? 'income' : 'expense';

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

const withName = (list: string[], name: string) =>
  list.some((existing) => sameName(existing, name)) ? list : [...list, name].sort(byName);

const withoutName = (list: string[], name: string) =>
  list.filter((existing) => !sameName(existing, name));

const readList = (value: unknown) =>
  Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];

export const fetchCustomCategories = async (token: string): Promise<CustomCategories> => {
  const response = await fetch(`${API_BASE_URL}/v1/categories/custom`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load your categories.');
  }
  const payload = (await response.json()) as Record<string, unknown> | null;
  return { expense: readList(payload?.expense), income: readList(payload?.income) };
};

export const saveCustomCategory = async (token: string, name: string, type: CategoryType) => {
  const response = await fetch(`${API_BASE_URL}/v1/categories/custom`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, type }),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to save this category.');
  }
};

export const deleteCustomCategory = async (token: string, name: string, type: CategoryType) => {
  const query = new URLSearchParams({ type, name }).toString();
  const response = await fetch(`${API_BASE_URL}/v1/categories/custom?${query}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to remove this category.');
  }
};

type UserCategoriesState = {
  categories: CustomCategories;
  /** Whose list this is, so the next account to sign in does not see it. */
  loadedFor: string | null;
  load: (token: string) => Promise<void>;
  /**
   * Keeps a typed category and returns the name to select: the built-in it
   * means ("groceries" is Food & Drinks), the spelling already kept
   * ("dividend" is "Dividend"), or the name as typed.
   */
  add: (token: string | null | undefined, name: string, type: CategoryType) => string;
  remove: (token: string, name: string, type: CategoryType) => Promise<void>;
};

/**
 * The categories this user named themselves, for every transaction form.
 *
 * A typed category used to live on its one entry and nowhere else, so the
 * next form offered only the built-in list. The server now keeps them (and
 * already counts the ones older entries carry); this holds the copy the
 * picker reads, so it can show them the moment it opens and change them
 * without waiting on the request.
 */
export const useUserCategories = create<UserCategoriesState>()((set, get) => ({
  categories: emptyCategories,
  loadedFor: null,

  load: async (token) => {
    if (get().loadedFor !== token) set({ categories: emptyCategories, loadedFor: token });
    try {
      const categories = await fetchCustomCategories(token);
      if (get().loadedFor === token) set({ categories });
    } catch {
      // The built-in list still works; the user's own come back next time.
    }
  },

  add: (token, name, type) => {
    const builtIn = resolveCategory(name, type);
    if (builtIn) return builtIn;
    const kept = get().categories[type].find((existing) => sameName(existing, name));
    if (kept) return kept;

    const insert = () =>
      set((state) => ({
        categories: { ...state.categories, [type]: withName(state.categories[type], name) },
      }));
    insert();
    if (token) {
      // Again once the server has it: a load that started before the add
      // would otherwise land afterwards and drop it from the list. If the
      // request fails, the entry saved with this category puts it on the
      // server's list anyway.
      void saveCustomCategory(token, name, type)
        .then(insert)
        .catch(() => undefined);
    }
    return name;
  },

  remove: async (token, name, type) => {
    const previous = get().categories[type];
    set((state) => ({
      categories: { ...state.categories, [type]: withoutName(state.categories[type], name) },
    }));
    try {
      await deleteCustomCategory(token, name, type);
    } catch (error) {
      set((state) => ({ categories: { ...state.categories, [type]: previous } }));
      throw error;
    }
  },
}));
