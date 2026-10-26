export const ELO_K = 32;

/** Expected score of A against B. */
export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/** `scoreA` is 1 for a win, 0.5 for a draw, 0 for a loss. Returns the new ratings, rounded. */
export function updateElo(a: number, b: number, scoreA: number, k = ELO_K): [number, number] {
    const ea = expected(a, b);
    const nextA = a + k * (scoreA - ea);
    const nextB = b + k * ((1 - scoreA) - (1 - ea));
    return [Math.round(nextA), Math.round(nextB)];
}
