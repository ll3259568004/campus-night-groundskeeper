export const COLS = 28;
export const ROWS = 17;
export const SIZE = 36;

export function point(col, row) {
  return { col, row, index: row * COLS + col, x: (col + .5) * SIZE, y: (row + .5) * SIZE };
}

export const routeSigns = [
  { ...point(14, 4), label: '库房窄路', opens: 1 },
  { ...point(14, 13), label: '看台外侧路', opens: 1 },
  { ...point(22, 7), label: '球场入口', opens: 2 },
  { ...point(22, 13), label: '球场外侧门', opens: 2 },
];

export const entrances = {
  narrow: { ...point(15, 4), label: '库房窄路' },
  outside: { ...point(16, 15), label: '看台外侧' },
  east: { ...point(26, 2), label: '东北入口' },
  south: { ...point(24, 16), label: '南侧入口' },
};

export function accessStage(col, row) {
  if (col === 14) return row === 4 || (row >= 12 && row <= 15) ? 1 : Infinity;
  if (col === 22) return (row >= 6 && row <= 8) || (row >= 12 && row <= 14) ? 2 : Infinity;
  if (col > 22) return 2;
  return col > 14 ? 1 : 0;
}
