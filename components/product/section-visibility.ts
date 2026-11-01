/** Une section sans contenu ne réserve aucun espace dans la fiche. */
export function visibleSectionItems<T>(items?: readonly T[] | null): readonly T[] | null {
  return items?.length ? items : null;
}
