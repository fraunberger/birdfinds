// One accent does all the talking: green means bagged, everywhere in the app.
// Everything still to climb stays paper-and-ink, so progress is the only color.

export const INK = "#0b0b0b";
export const INK_SOFT = "#52514e";
export const MUTED = "#898781";
export const GRID = "#e1e0d9";
export const AXIS = "#c3c2b7";

export const SKY = "#fcfcfb";
export const GROUND = "#f1f0ea";
export const GROUND_EDGE = "#dcdad2";
export const GRATICULE = "#e4e2da";

export const TOGO_LIT = "#ffffff";
export const TOGO_SHADE = "#e2e0d9";
export const TOGO_STROKE = "#3d3c38";

export const BAGGED_LIT = "#5f9f73";
export const BAGGED_SHADE = "#3d7b52";
export const BAGGED_STROKE = "#1c4530";
/** Chart marks: bars, lines, filled cells. */
export const BAGGED = "#2f7a4b";
/** The unfilled part of a meter: a lighter step of the same green. */
export const BAGGED_TRACK = "#d9eadd";

export const FLAG = "#e4572e";

/** SVG text is pinned to a monospace stack so label widths can be measured by character count. */
export const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Linear blend of two #rrggbb colors; `amount` 0 keeps `from`, 1 gives `to`. */
export function mix(from: string, to: string, amount: number): string {
    const a = parseInt(from.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const k = Math.min(1, Math.max(0, amount));
    const channel = (shift: number) => {
        const x = (a >> shift) & 0xff;
        const y = (b >> shift) & 0xff;
        return Math.round(x + (y - x) * k);
    };
    const value = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    return `#${value.toString(16).padStart(6, "0")}`;
}
