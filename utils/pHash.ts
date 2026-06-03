// utils/pHash.ts

// NEW ADDITION: This entire file is new.
// Implements perceptual hashing (pHash) for image similarity detection.
// pHash works by:
//   1. Resizing the image to a small fixed size (32x32)
//   2. Converting to grayscale
//   3. Computing the DCT (Discrete Cosine Transform) to get frequency data
//   4. Taking the top-left 8x8 block of DCT values (low frequencies = overall structure)
//   5. Comparing each value to the median - above = 1, below = 0
//   6. This produces a 64-bit binary fingerprint as a hex string
// Two visually similar images will produce pHash values with low Hamming distance.

import sharp from "sharp";

// ---- Types ----

// A 64-character hex string representing the 64-bit perceptual hash
// e.g. "a1b2c3d4e5f6a7b8..."
type PHashHex = string;

// ---- Constants ----

// The size we resize images to before computing DCT.
// 32x32 gives us a 1024-value grid; we use top-left 8x8 of DCT = 64 bits.
const HASH_SIZE = 32; // TypeScript: plain number constant

// Number of bits in the final hash (8x8 DCT block)
const HASH_BITS = 64; // TypeScript: plain number constant

// Maximum allowed Hamming distance to consider two images "similar".
// Out of 64 bits, 8 means up to ~12.5% of bits can differ.
// Tight enough for safety in medical/agricultural context.
export const PHASH_SIMILARITY_THRESHOLD = 8; // TypeScript: exported number constant

// ---- DCT Implementation ----

// TypeScript: number[][] is a 2D array type (array of arrays of numbers)
// This computes the 2D Discrete Cosine Transform of a pixel grid.
// DCT converts spatial pixel data into frequency data.
// Low-frequency components (top-left of result) represent the overall structure.
function computeDCT(pixels: number[][]): number[][] {
  const N = pixels.length; // TypeScript: number inferred from array length

  // TypeScript: Array.from with map callback creates a 2D array initialized to 0
  const dct: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;

      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          // DCT formula: cos((2x+1)*u*PI / 2N) * cos((2y+1)*v*PI / 2N) * pixel
          sum +=
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N)) *
            pixels[x][y];
        }
      }

      // Scaling factors for DCT normalization
      // TypeScript: ternary expression returning number
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;

      dct[u][v] = (2 / N) * cu * cv * sum;
    }
  }

  return dct;
}

// ---- Main pHash Function ----

// TypeScript: async function that takes a Buffer and returns Promise<PHashHex>
// Buffer is Node.js built-in type for raw binary data (our image bytes)
export async function computePerceptualHash(
  imageBuffer: Buffer,
): Promise<PHashHex> {
  // Step 1: Use sharp to resize image to 32x32 grayscale pixels
  // sharp returns raw pixel bytes when we use .raw() output
  const { data } = await sharp(imageBuffer)
    .resize(HASH_SIZE, HASH_SIZE, { fit: "fill" }) // Force exact 32x32
    .grayscale() // Convert to single-channel grayscale
    .raw() // Output raw pixel bytes (no file format overhead)
    .toBuffer({ resolveWithObject: true }); // TypeScript: resolveWithObject gives us { data, info }

  // Step 2: Convert flat Uint8Array pixel bytes into a 2D number[][] grid
  // TypeScript: Uint8Array is Node.js typed array for unsigned 8-bit integers (0-255)
  // Array.from converts it to a regular number[]
  const pixels: number[][] = [];

  for (let row = 0; row < HASH_SIZE; row++) {
    // TypeScript: slice returns a sub-array; Array.from converts Uint8Array to number[]
    const rowPixels = Array.from(
      data.slice(row * HASH_SIZE, (row + 1) * HASH_SIZE),
    ) as number[];
    pixels.push(rowPixels);
  }

  // Step 3: Compute 2D DCT on the 32x32 pixel grid
  const dct = computeDCT(pixels);

  // Step 4: Extract top-left 8x8 block from DCT result (low frequency components)
  // These represent the coarse visual structure, ignoring fine detail and noise
  const dctLow: number[] = []; // TypeScript: flat number array

  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      // Skip DC component (u=0, v=0) as it represents overall brightness
      // which varies a lot between images of the same subject
      if (u === 0 && v === 0) continue;
      dctLow.push(dct[u][v]);
    }
  }

  // Step 5: Compute median of the 63 DCT values
  // TypeScript: spread operator [...dctLow] creates a copy before sorting (sort mutates)
  const sorted = [...dctLow].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]; // TypeScript: Math.floor returns number

  // Step 6: Build 64-bit hash - each bit is 1 if value > median, 0 otherwise
  // We use all 64 positions (pad back to 64 bits including the skipped DC slot)
  let hashBits = "";

  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) {
        hashBits += "0"; // DC component always 0
      } else {
        hashBits += dct[u][v] > median ? "1" : "0";
      }
    }
  }

  // Step 7: Convert 64-bit binary string to 16-character hex string for compact storage
  // Process 4 bits at a time to produce one hex digit each
  let hexHash = "";
  for (let i = 0; i < HASH_BITS; i += 4) {
    const nibble = hashBits.slice(i, i + 4); // TypeScript: string slice
    hexHash += parseInt(nibble, 2).toString(16); // Convert binary nibble to hex digit
  }

  return hexHash; // Returns e.g. "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}

// ---- Hamming Distance Function ----

// TypeScript: function takes two PHashHex strings and returns number
// Hamming distance = number of bit positions where the two hashes differ.
// Lower = more similar. 0 = identical visual fingerprint.
export function computeHammingDistance(
  hash1: PHashHex,
  hash2: PHashHex,
): number {
  // Guard: if either hash is missing/empty, return max distance (no match)
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return HASH_BITS; // TypeScript: return number constant
  }

  let distance = 0;

  // Convert each hex character back to 4-bit binary and count differing bits
  for (let i = 0; i < hash1.length; i++) {
    // parseInt with base 16 converts hex char to number
    // XOR (^) produces 1 bits where the two values differ
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);

    // Count the number of 1 bits in the XOR result (Brian Kernighan's bit counting)
    // TypeScript: let declares mutable variable
    let bits = xor;
    while (bits > 0) {
      distance += bits & 1; // Add 1 if lowest bit is set
      bits >>= 1; // Right-shift to check next bit
    }
  }

  return distance;
}

// ---- Similarity Check Helper ----

// TypeScript: takes two hashes and optional threshold, returns boolean
// Convenience wrapper used in the service layer
export function areImagesSimilar(
  hash1: PHashHex,
  hash2: PHashHex,
  threshold: number = PHASH_SIMILARITY_THRESHOLD,
): boolean {
  return computeHammingDistance(hash1, hash2) <= threshold;
}
