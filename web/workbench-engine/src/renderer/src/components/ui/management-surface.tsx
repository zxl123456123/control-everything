import { createContext, useContext } from 'react'

// Portals retain this React context without changing the surrounding workbench.
const ManagementSurfaceContext = createContext(false)
const ManagementSurfaceVisibleContext = createContext(false)
export const ManagementSurfaceProvider = ManagementSurfaceContext.Provider
export const ManagementSurfaceVisibleProvider = ManagementSurfaceVisibleContext.Provider
export function useManagementSurface(): boolean {
  return useContext(ManagementSurfaceContext)
}
export function useManagementSurfaceVisible(): boolean {
  return useContext(ManagementSurfaceVisibleContext)
}
