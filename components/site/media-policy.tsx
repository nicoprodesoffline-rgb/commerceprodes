"use client";

import { createContext, useContext } from "react";

/**
 * Politique d'affichage des images de la vitrine. Une génération marquée « données de test » ne publie que des visuels synthétiques (bruit, motifs,
 * « image de démonstration ») : la vitrine ne les montre jamais, elle affiche l'état neutre « Visuel non disponible ». Le défaut est « montrer » :
 * seul le gabarit racine, qui connaît l'étiquette de la génération servie, peut le refuser. Aucune photo n'est jamais substituée à une autre.
 */
const MediaPolicyContext = createContext(true);

export function MediaPolicyProvider({ showImages, children }: { showImages: boolean; children: React.ReactNode }) {
  return <MediaPolicyContext.Provider value={showImages}>{children}</MediaPolicyContext.Provider>;
}

export function useShowImages(): boolean {
  return useContext(MediaPolicyContext);
}
