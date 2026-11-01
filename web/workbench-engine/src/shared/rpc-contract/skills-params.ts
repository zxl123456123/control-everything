import { z } from 'zod'
import { SkillDiscoveryTargetSchema } from '../skills'
import { BUNDLED_SKILL_RENAMES } from '../bundled-skill-renames'

export const SkillsMigrateNamesParams = z
  .object({
    names: z
      .array(z.string().refine((name) => Object.values(BUNDLED_SKILL_RENAMES).includes(name)))
      .min(1)
      .max(Object.keys(BUNDLED_SKILL_RENAMES).length),
    target: z
      .object({
        runtime: z.enum(['host', 'wsl']).optional(),
        wslDistro: z.string().nullable().optional(),
        worktreeId: z.string().nullable().optional()
      })
      .strict()
      .optional()
  })
  .strict()

export const SkillsGetInstallProgressParams = z
  .object({ operationId: z.string().min(1).max(128) })
  .strict()

export const SkillsCancelInstallParams = z
  .object({ operationId: z.string().min(1).max(128) })
  .strict()

export const SkillsDiscoverParams = SkillDiscoveryTargetSchema.default({})
