import { create } from 'zustand'

export const useLangStore = create((set) => ({
  lang: localStorage.getItem('eventflow_lang') || 'en',
  setLang: (lang) => {
    localStorage.setItem('eventflow_lang', lang)
    set({ lang })
  },
}))
