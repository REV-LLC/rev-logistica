export function getRequestDraftStorageKey(userId: string) {
  return `rev:transport-draft:${userId}`;
}

export function resolveRequestDraftTarget(
  search: string,
  storedDraftId: string | null,
) {
  const params = new URLSearchParams(search);
  const editId = params.get('edit');
  const explicitDraftId = params.get('draft');
  const draftId = explicitDraftId ?? (editId ? null : storedDraftId);

  if (editId) {
    return { documentId: editId, autosaved: false, target: `edit:${editId}` };
  }
  if (draftId) {
    return { documentId: draftId, autosaved: true, target: `draft:${draftId}` };
  }
  return null;
}
