// Preview-only stand-ins for native modules. They do nothing; the preview renders views, not routes.
export const Stack = { Screen: () => null }
export const useRouter = () => ({
  back: () => undefined,
  push: () => undefined,
  replace: () => undefined
})
