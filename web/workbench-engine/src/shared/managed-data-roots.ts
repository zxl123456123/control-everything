/** Private installed-slot operation; not a public CLI alias or a user setting. */
export const MANAGED_DATA_ROOT_FLAG = '--zkyq-data-root'
export const MANAGED_DATA_ROOT_VERSION = 1
export const MANAGED_DATA_ROOT_PATH_MARKER = '__ZKYQ_DATA_ROOT_PATH__'
export const MANAGED_DATA_ROOT_HELPER_MARKER = '__ZKYQ_DATA_ROOT_HELPER__'
export const MANAGED_DATA_ROOT_TARGET_MARKER = '__ZKYQ_DATA_ROOT_TARGET__'
export const MANAGED_DATA_ROOT_RESULT_MARKER = '__ZKYQ_DATA_ROOT_RESULT__'

export type ManagedDataRootResult = {
  version: 1
  userDataDir: string
  launchUserDataDir: string
}
