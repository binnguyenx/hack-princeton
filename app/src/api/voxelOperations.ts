export type VoxelParameters = { operation: 'voxel.box' | 'reconstruct.mirror-roi'; bounds: [number[], number[]]; mode?: 'fill' | 'erase'; plane_i?: number }
export const voxelClient = {
  async execute(candidateId: string, context: { project_id: string; case_id: string; expected_revision_id: string }, parameters: VoxelParameters) {
    const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/voxel-operation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context, ...parameters }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Voxel operation failed (HTTP ${response.status})`)
    if (typeof data?.revisionId !== 'string' || !Number.isInteger(data.changedVoxels) || data.changedVoxels <= 0) throw new Error('Invalid voxel result; reload the project before retrying')
    return data as { revisionId: string; volumeHash: string; changedVoxels: number; operation: string }
  },
}
