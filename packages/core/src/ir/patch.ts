/**
 * A semantic patch applied to the resolved IR before generation.
 *
 * Patches let users customize generated output without editing generated files.
 * They operate on the IR (not on generated text), so drift detection remains
 * meaningful: `check-drift` compares against the patched IR hash.
 *
 * Supported targets:
 *   meta                                   → SchemaMeta
 *   entity.<Name>                          → EntitySchema top-level (description, goal)
 *   entity.<Name>.fields.<field>           → FieldSchema
 *   entity.<Name>.behaviors.<behavior>     → BehaviorSchema
 *   entity.<Name>.stateMachine.states.<s>  → StateSchema
 *   api.<Name>                             → ApiSchema top-level
 *   api.<Name>.endpoints.<key>             → EndpointSchema
 *
 * Supported ops:
 *   merge    — shallow-merges `value` into the target node
 *   suppress — removes files whose path matches `pattern` (glob-style * wildcard)
 */

export type PatchOp = 'merge' | 'suppress'

export interface MergePatch {
  op: 'merge'
  /**
   * Dotted-path target in the IR. Examples:
   *   "entity.Book.fields.title"
   *   "entity.Member.behaviors.deactivate"
   *   "meta"
   */
  target: string
  /** Plain object whose keys are merged into the target node. */
  value: Record<string, unknown>
}

export interface SuppressPatch {
  op: 'suppress'
  /**
   * File-path pattern relative to the output directory.
   * Supports `*` as a wildcard within a single path segment.
   * Examples:
   *   "typescript/index.ts"
   *   "sql/*.sql"
   */
  pattern: string
}

export type Patch = MergePatch | SuppressPatch

export interface PatchSet {
  patches: Patch[]
}

export function definePatchSet(set: PatchSet): PatchSet {
  return set
}
