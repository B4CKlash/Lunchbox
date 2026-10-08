export type SettingsDraft<T> = { baseline: string; values: T };

export function createSettingsDraft<T>(values: T): SettingsDraft<T> {
  return { baseline: JSON.stringify(values), values };
}

/** New household settings update clean forms but never replace a dirty draft. */
export function resolveSettingsDraft<T>(draft: SettingsDraft<T>, incoming: T) {
  const dirty = JSON.stringify(draft.values) !== draft.baseline;
  const changed = JSON.stringify(incoming) !== draft.baseline;
  return { draft: changed && !dirty ? createSettingsDraft(incoming) : draft, conflict: changed && dirty };
}
