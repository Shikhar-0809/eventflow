import { useSyncExternalStore } from 'react'

// A tiny path switch instead of a router library: history.pushState, one popstate listener and link interception.
// Everything that shows a screen reads the location through useLocation(), so back/forward just work.

export const ROUTES = {
  '/': 'landing',
  '/app': 'app',
  '/login': 'login',
  '/signup': 'signup',
  '/forgot-password': 'forgot',
  '/privacy': 'privacy',
}

// A trailing slash is fine; any path not listed is a 404.
export const matchRoute = (pathname) => ROUTES[pathname.replace(/\/+$/, '') || '/'] ?? 'not-found'

const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// path + query, so a change to ?next= alone re-renders too.
const getLocation = () => window.location.pathname + window.location.search

export const useLocation = () => useSyncExternalStore(subscribe, getLocation)

export const navigate = (to, { replace = false } = {}) => {
  if (replace) {
    window.history.replaceState(null, '', to)
  } else {
    window.history.pushState(null, '', to)
    window.scrollTo(0, 0)
  }
  notify()
}

// Only a same-origin path is a safe place to send someone after login: it must start with "/" and not "//"
// (protocol-relative) or "/\" (browsers read that as "//"). The auth screens are not valid targets either (a loop).
export const safeNext = (next) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/app'
  const route = matchRoute(next.split(/[?#]/)[0])
  return route === 'login' || route === 'signup' || route === 'forgot' ? '/app' : next
}

// Plain <a href="/login"> links navigate in place; modified clicks, new-tab links and external links are left alone.
export const installLinkInterception = () => {
  window.addEventListener('popstate', notify)
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin || matchRoute(url.pathname) === 'not-found') return
    event.preventDefault()
    navigate(url.pathname + url.search + url.hash)
  })
}
