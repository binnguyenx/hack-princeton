"""Deterministic replies from graph-verified metadata, never clinical inference."""
from skullfix_ai.schemas.workspace import AppObjectContext


def read_only_reply(message: str, history, context: AppObjectContext) -> str:
    followups = {'yes', 'continue', 'tell me more', 'more details', 'what about it'}
    def normalize(text):
        return text.strip().casefold().rstrip('.!?')
    intent = normalize(message)
    if intent in followups:
        intent = ''
        for turn in reversed(history):
            if turn.role != 'human':
                continue
            previous = normalize(turn.content)
            if previous and previous not in followups:
                intent = previous
                break
    identity = (f'Project {context.project_id}; case {context.case_id}; selected object {context.selected_object_id}. '
                f'Source sample {context.sample_id}; selected volume hash {context.volume_hash}.')
    if context.revision_id:
        identity += f' Current candidate revision: {context.revision_id}.'
    grid = ' × '.join(str(size) for size in context.spatial.sizes)
    metadata = f'Grid: {grid} voxels; units: {context.spatial.units}; spatial metadata verified: {str(context.spatially_verified).lower()}.'
    limits = 'Fake model, read-only metadata. No geometry operation or clinical assessment was performed. No data was changed.'
    if 'brief' in intent or 'reconstruction' in intent:
        lead = ('Read-only reconstruction brief. The selected source and revision are listed below. '
                'Reconstruction, implant design and clinical constraints are not implemented in this chat; '
                'a real reconstruction requires separately agreed mechanical tools and requirements.')
    elif any(word in intent for word in ('measure', 'dimension', 'size', 'volume')):
        lead = ('I can report stored grid metadata for this selection. Geometry measurements, defect area and '
                'implant fit are unavailable through this read-only chat; grid dimensions are not defect measurements.')
    elif any(word in intent for word in ('implant', 'constraint', 'recommend', 'margin', 'apply', 'restore', 'generate', 'create')):
        lead = ('This chat can inspect selection metadata only. It cannot recommend clinical implant parameters, '
                'verify margins, apply placement, restore revisions or generate candidates.')
    elif 'skull' in intent or 'anatomy' in intent:
        lead = 'We can inspect the selected skull source metadata. The source and current revision below identify exactly what this conversation is about.'
    else:
        lead = 'Here is the authoritative metadata for the current selection. This fake model supports metadata inspection and a read-only reconstruction brief, not general model reasoning.'
    return '\n\n'.join([lead, identity, metadata, limits])
