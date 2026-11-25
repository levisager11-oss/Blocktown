// Buildings are put together from a handful of simple shapes. A blueprint is a list of parts.

/**
 * Every shape fits a 1 x 1 x 1 box that stands on the ground: x and z run from -0.5 to 0.5, y from 0 to 1.
 * - box: a plain block
 * - win: a block with rows of windows on its four sides (they light up at night)
 * - pyramid: a four-sided roof with its tip in the middle
 * - gable: a pitched roof, its ridge running along x
 * - cyl: an upright round column
 * - cone: a round cone, tip up
 * - dome: half a ball
 * - tower: a round cooling tower, narrower at the top
 */
export type Shape = "box" | "win" | "pyramid" | "gable" | "cyl" | "cone" | "dome" | "tower";
export const SHAPES: Shape[] = ["box", "win", "pyramid", "gable", "cyl", "cone", "dome", "tower"];

export interface Part {
  shape: Shape;
  /** Where the middle of its base is, in the plot's own space: x across the plot, z from back (-) to the road (+), y up from the ground. */
  x: number; y: number; z: number;
  /** Its size: width (x), height (y), depth (z). */
  sx: number; sy: number; sz: number;
  /** Colour as 0xRRGGBB. */
  color: number;
  /** Turns, in radians: ry around the upright axis, then rx (tilt forward/back) and rz (tilt sideways). */
  ry?: number; rx?: number; rz?: number;
}
