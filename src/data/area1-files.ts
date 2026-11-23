/** Area 1 models (loaded before gameplayStart). Shared by the loader and the HTML preload links (vite.config.ts). */
export const CHARACTER_KEYS = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];

/** Paths under `assets/`: the props GLB first, then one GLB per character in CHARACTER_KEYS order. */
export const AREA1_FILES: readonly string[] = ['props-area1.glb', ...CHARACTER_KEYS.map((k) => `characters/${k}.glb`)];
