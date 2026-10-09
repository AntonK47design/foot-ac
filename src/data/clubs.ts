/** Fictional academies for the league ladder and fictional clubs that buy graduates. No real clubs. */

export interface TeamDef {
  id: string;
  name: string;
  /** Kit colours (shirt, shorts) for match opponents. */
  shirt: number;
  shorts: number;
  /** Average OVR of their line-up. */
  strength: number;
}

export interface DivisionDef {
  nameKey: string;
  teams: TeamDef[];
}

const team = (id: string, name: string, shirt: number, shorts: number, strength: number): TeamDef => ({ id, name, shirt, shorts, strength });

/** Index 0 is the bottom division; the academy starts there. Each division has 5 rivals (+ us = 6 teams). */
export const DIVISIONS: DivisionDef[] = [
  {
    nameKey: 'league.div.0',
    teams: [
      team('riverside', 'Riverside Rovers', 0xd63c3c, 0xffffff, 34),
      team('northgate', 'Northgate FC', 0x2f6bff, 0x1d2433, 36),
      team('harbour', 'Harbour City', 0x2bb673, 0xffffff, 38),
      team('maple', 'Maple Town', 0xff8a2e, 0x1d2433, 40),
      team('oldmill', 'Old Mill United', 0x8a5cf6, 0xffffff, 42),
    ],
  },
  {
    nameKey: 'league.div.1',
    teams: [
      team('lakeside', 'Lakeside Athletic', 0x1fb6c9, 0x1d2433, 42),
      team('ironbridge', 'Ironbridge Town', 0x6b7280, 0xd63c3c, 44),
      team('foxhollow', 'Fox Hollow', 0xe0782b, 0xffffff, 46),
      team('stonebay', 'Stonebay FC', 0x1d2433, 0xffd23f, 48),
      team('greenvale', 'Greenvale Youth', 0x3daa4a, 0x1d2433, 50),
    ],
  },
  {
    nameKey: 'league.div.2',
    teams: [
      team('kingsmoor', 'Kingsmoor Academy', 0xb91c1c, 0xffd23f, 50),
      team('silverton', 'Silverton FC', 0xc0c7d4, 0x1d2433, 52),
      team('eastport', 'Eastport Rangers', 0x1e40af, 0xffffff, 54),
      team('redcliff', 'Redcliff Rovers', 0xef4444, 0x1d2433, 56),
      team('highfield', 'Highfield Youth', 0x14b8a6, 0xffffff, 58),
    ],
  },
  {
    nameKey: 'league.div.3',
    teams: [
      team('westbrook', 'Westbrook City', 0x0ea5e9, 0xffffff, 58),
      team('ashford', 'Ashford Athletic', 0x7c3aed, 0xffd23f, 60),
      team('portlow', 'Port Low FC', 0xf59e0b, 0x1d2433, 62),
      team('elmwood', 'Elmwood United', 0x16a34a, 0xffffff, 64),
      team('blackrock', 'Blackrock Academy', 0x111827, 0xef4444, 66),
    ],
  },
  {
    nameKey: 'league.div.4',
    teams: [
      team('royalvale', 'Royal Vale', 0x4338ca, 0xffd23f, 66),
      team('sunmouth', 'Sunmouth FC', 0xfacc15, 0x1d2433, 68),
      team('crowngate', 'Crowngate City', 0xdc2626, 0xffffff, 70),
      team('northstar', 'Northstar Youth', 0x0f766e, 0xffd23f, 72),
      team('grandport', 'Grandport Rangers', 0x1d4ed8, 0xef4444, 74),
    ],
  },
];

/** Fictional professional clubs that buy graduates (transfer panel). */
export const BUYERS = [
  'Atlas City',
  'Porto Vela',
  'Real Montaro',
  'Kingsbridge Athletic',
  'Union Solvik',
  'Sporting Alvor',
  'Dynamo Kestra',
  'Olympia Brenn',
  'Valmora FC',
  'Corvin United',
  'Estrela Norte',
  'Hollen Rovers',
];

/** Daily Cup opponents (one per day, rotating). */
export const CUP_TEAMS = [
  { id: 'cup_vale', name: 'Vale Cup XI', shirt: 0xffffff, shorts: 0x1d2433 },
  { id: 'cup_harbour', name: 'Harbour Select', shirt: 0x0ea5e9, shorts: 0xffffff },
  { id: 'cup_ridge', name: 'Ridge Academy', shirt: 0x7c3aed, shorts: 0xffd23f },
  { id: 'cup_summit', name: 'Summit United', shirt: 0xef4444, shorts: 0xffffff },
  { id: 'cup_meadow', name: 'Meadow Stars', shirt: 0x16a34a, shorts: 0x1d2433 },
];
