/**
 * Asset groups packed by tools/assets.ts. Each group → public/assets/<id>.glb with one root node per model (named by key).
 * `area1: true` groups load before gameplayStart; others are lazy.
 */
export interface AssetSource {
  /** Path relative to assets-src/ */
  file: string;
  pack: string;
}

export interface AssetGroup {
  id: string;
  area1: boolean;
  models: Record<string, AssetSource>;
  /** Characters: one GLB per model, kit UV remap, shared clips from `clipSource`. */
  characters?: { clipSource: string; clips: string[] };
}

export interface PackInfo {
  title: string;
  author: string;
  url: string;
  license: string;
  licenseFile: string;
}

export const PACKS: Record<string, PackInfo> = {
  'kenney-mini-characters': {
    title: 'Mini Characters 1.0',
    author: 'Kenney (www.kenney.nl)',
    url: 'https://kenney.nl/assets/mini-characters',
    license: 'CC0 1.0',
    licenseFile: 'kenney/mini-characters/License.txt',
  },
  'kaykit-furniture': {
    title: 'KayKit Furniture Bits 1.0',
    author: 'Kay Lousberg',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0',
    license: 'CC0 1.0',
    licenseFile: 'kaykit/furniture-bits/LICENSE.txt',
  },
  'kaykit-prototype': {
    title: 'KayKit Prototype Bits 1.0',
    author: 'Kay Lousberg',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0',
    license: 'CC0 1.0',
    licenseFile: 'kaykit/prototype-bits/LICENSE.txt',
  },
  'kaykit-city': {
    title: 'KayKit City Builder Bits 1.0',
    author: 'Kay Lousberg',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0',
    license: 'CC0 1.0',
    licenseFile: 'kaykit/city-builder-bits/LICENSE.txt',
  },
  'kaykit-restaurant': {
    title: 'KayKit Restaurant Bits 1.0',
    author: 'Kay Lousberg',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0',
    license: 'CC0 1.0',
    licenseFile: 'kaykit/restaurant-bits/LICENSE.txt',
  },
};

const f = (dir: string, pack: string, names: string[]): Record<string, AssetSource> =>
  Object.fromEntries(names.map((n) => [n, { file: `${dir}/${n}.gltf`, pack }]));

const CHAR_DIR = 'kenney/mini-characters/Models/GLB format';
const CHARS = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];

export const GROUPS: AssetGroup[] = [
  {
    id: 'characters',
    area1: true,
    models: Object.fromEntries(CHARS.map((c) => [c, { file: `${CHAR_DIR}/character-${c}.glb`, pack: 'kenney-mini-characters' }])),
    characters: {
      clipSource: 'male-a',
      clips: ['idle', 'walk', 'sprint', 'sit', 'pick-up', 'emote-yes', 'holding-both', 'attack-kick-right', 'interact-right', 'crouch', 'jump'],
    },
  },
  {
    id: 'props-area1',
    area1: true,
    models: {
      ...f('kaykit/furniture-bits', 'kaykit-furniture', [
        'couch',
        'armchair',
        'cabinet_medium_decorated',
        'cabinet_small_decorated',
        'shelf_B_large_decorated',
        'shelf_A_big',
        'pictureframe_large_A',
        'pictureframe_large_B',
        'pictureframe_medium',
        'pictureframe_standing_A',
        'cactus_medium_A',
        'cactus_small_A',
        'lamp_standing',
        'rug_rectangle_stripes_A',
        'rug_oval_A',
        'table_medium_long',
        'table_small',
        'chair_A',
        'book_set',
      ]),
      ...f('kaykit/prototype-bits', 'kaykit-prototype', ['Barrel_A', 'Box_A', 'Box_B', 'Pallet_Small_Decorated_A', 'Dummy_Base', 'target_stand_A', 'target_wall_small']),
      ...f('kaykit/city-builder-bits', 'kaykit-city', ['bench', 'bush', 'streetlight', 'trash_A', 'dumpster', 'firehydrant', 'box_A']),
      ...f('kaykit/restaurant-bits', 'kaykit-restaurant', ['crate', 'chair_stool', 'towelrail', 'door_A']),
    },
  },
];
