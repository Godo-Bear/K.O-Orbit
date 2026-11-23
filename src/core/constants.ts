export const MAX_PLAYERS = 10;
export const SIM_HZ = 60;
export const SIM_DT = 1000 / SIM_HZ;

/** Ten distinct, high-contrast player colors (P1–P10). */
export const PLAYER_COLORS = [
  '#ff4757', // P1 red
  '#3e8bff', // P2 blue
  '#ffd23f', // P3 yellow
  '#2ed573', // P4 green
  '#ff8c1a', // P5 orange
  '#b06bff', // P6 purple
  '#1fd6d6', // P7 cyan
  '#ff6bcb', // P8 pink
  '#c8f04a', // P9 lime
  '#e8e8f0', // P10 white
];

export const playerLabel = (slot: number) => `P${slot + 1}`;
