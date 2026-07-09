import { create } from 'zustand'

export const useInventoryStore = create((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  upsertItem: (item) => set((state) => {
    const exists = state.items.some((i) => i.id === item.id)
    return {
      items: exists
        ? state.items.map((i) => (i.id === item.id ? item : i))
        : [...state.items, item],
    }
  }),
  removeItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id),
  })),
}))
