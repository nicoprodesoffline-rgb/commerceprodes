/**
 * Choix de variante sur la fiche : un sélecteur par axe, des CHOIX EXPLICITES (épinglés) qui seuls décident
 * quelles valeurs des autres axes sont compatibles ; une valeur incompatible reste cliquable et RECALE sur une variante PUBLIÉE réelle (jamais une
 * combinaison inventée, C0 §8.3) ; recliquer un choix le retire. Fonctions pures, sans dépendance : testées sans navigateur.
 * La variante affichée au départ (première, ou celle de `?article=`) n'est PAS un choix.
 */
export type ChoiceItem = { public_item_key: string; variant_axes: Record<string, string> };
export type Pinned = Record<string, string>;
export type ChoiceState = { key: string; pinned: Pinned };
export type Adjustment = { axis: string; from: string; to: string };

const axesOf = (items: readonly ChoiceItem[]): string[] => {
  const out: string[] = [];
  for (const item of items) for (const axis of Object.keys(item.variant_axes)) if (!out.includes(axis)) out.push(axis);
  return out;
};
const valueOf = (item: ChoiceItem, axis: string): string => item.variant_axes[axis] ?? "";
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Axes dont le nom (ou l'identifiant) commence par « type » : ils disent la nature du produit et passent en premier ; partition STABLE. */
export function orderAxes<T extends { axis: string; label: string }>(options: readonly T[]): T[] {
  const isType = (o: T) => fold(o.label).startsWith("type") || fold(o.axis).startsWith("type");
  return [...options.filter(isType), ...options.filter((o) => !isType(o))];
}

/** Oui s'il existe un Item publié qui porte `value` sur `axis` ET tous les choix épinglés des AUTRES axes. Aucun choix : toute valeur qui existe l'est. */
export function compatible(items: readonly ChoiceItem[], pinned: Pinned, axis: string, value: string): boolean {
  return value !== "" && items.some((i) => valueOf(i, axis) === value && respects(i, pinned, axis));
}

const respects = (item: ChoiceItem, pinned: Pinned, except: string): boolean =>
  Object.entries(pinned).every(([k, v]) => k === except || valueOf(item, k) === v);

/**
 * Clic sur `axis = value`. Valeur déjà épinglée : le choix est retiré, la variante affichée ne bouge pas. Sinon : si la combinaison voulue existe, elle est
 * retenue ; sinon on se cale sur l'Item publié qui respecte TOUS les choix épinglés et ressemble le plus à la sélection courante, à défaut sur le premier
 * qui porte la valeur. Le choix est alors épinglé, avec ceux d'avant qui tiennent encore.
 */
export function click(items: readonly ChoiceItem[], state: ChoiceState, axis: string, value: string): ChoiceState {
  if (state.pinned[axis] === value) {
    const { [axis]: _removed, ...rest } = state.pinned;
    return { key: state.key, pinned: rest };
  }
  const current = items.find((i) => i.public_item_key === state.key);
  if (!current) return state;
  const axes = axesOf(items);
  const wanted = items.find((i) => axes.every((a) => (a === axis ? value : valueOf(current, a)) === valueOf(i, a)));
  let next = wanted;
  if (!next) {
    const carrying = items.filter((i) => valueOf(i, axis) === value);
    const keeping = Object.keys(state.pinned).length > 0 ? carrying.filter((i) => respects(i, state.pinned, axis)) : [];
    const closeness = (i: ChoiceItem) => axes.filter((a) => a !== axis && valueOf(i, a) === valueOf(current, a)).length;
    next = keeping.reduce<ChoiceItem | undefined>((best, i) => (best === undefined || closeness(i) > closeness(best) ? i : best), undefined) ?? carrying[0];
  }
  if (!next) return state;
  const stillHeld = Object.fromEntries(Object.entries(state.pinned).filter(([k, v]) => valueOf(next, k) === v));
  return { key: next.public_item_key, pinned: { ...stillHeld, [axis]: value } };
}

/** Les AUTRES axes que le recalage a changés : de quoi dire à l'acheteur ce qui a été ajusté. */
export function adjustments(items: readonly ChoiceItem[], beforeKey: string, afterKey: string, clickedAxis: string): Adjustment[] {
  const before = items.find((i) => i.public_item_key === beforeKey);
  const after = items.find((i) => i.public_item_key === afterKey);
  if (!before || !after) return [];
  return axesOf(items)
    .filter((a) => a !== clickedAxis && valueOf(before, a) !== valueOf(after, a))
    .map((a) => ({ axis: a, from: valueOf(before, a), to: valueOf(after, a) }));
}
