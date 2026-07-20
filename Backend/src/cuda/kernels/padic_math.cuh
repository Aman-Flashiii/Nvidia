// ==============================================================================
// File: padic_math.cuh
// Description: Device-side mathematical primitives for the p-Adic ultrametric 
//              space. Implements 128-bit Count Leading Zeros, p-Adic valuation, 
//              and the ultrametric distance function.
// ==============================================================================
#pragma once

#include <cuda_runtime.h>
#include <cstdint>

// Use the portable uint128_t defined in padic_quantizer.h (lo/hi struct).
// This works on MSVC, GCC, Clang, and NVCC with any host compiler.
#include "../../core/padic_quantizer.h"

namespace padic::device {

/**
 * @brief Computes the 128-bit Count Leading Zeros (CLZ).
 * 
 * Hardware Mapping: NVIDIA GPUs do not have a native 128-bit CLZ instruction.
 * We decompose the 128-bit integer into two 64-bit halves and use the native 
 * 64-bit __clzll() intrinsic. This compiles down to the LOP3/ISETP instruction 
 * sequence, achieving near-native throughput.
 */
__device__ __forceinline__ int clz128(uint128_t x) {
    // The struct stores the 128-bit value as lo (bits 0-63) and hi (bits 64-127).
    // CLZ: count leading zeros starting from the most significant bit (hi).
    if (x.hi != 0) {
        // Leading zeros are entirely within the high 64-bit half.
        return __clzll(x.hi);
    } else if (x.lo != 0) {
        // All 64 high bits are zero; count in the low half, offset by 64.
        return 64 + __clzll(x.lo);
    }
    return 128; // All bits zero
}

/**
 * @brief Computes the p-Adic valuation (v_2) of the difference between two vectors.
 * 
 * Math Note: In the 2-adic metric, the valuation v_2(x - y) is the exponent of 
 * the highest power of 2 that divides (x - y). In our binary hypercube embedding,
 * subtraction is equivalent to XOR. The highest power of 2 dividing (x XOR y) 
 * corresponds exactly to the number of trailing zeros. However, because we mapped 
 * the most significant bits to the coarsest trie levels, we use Count *Leading* 
 * Zeros (CLZ) to find the Longest Common Prefix (LCP).
 * 
 * Therefore, p-Adic Valuation = LCP = clz128(x XOR y).
 */
__device__ __forceinline__ int padic_valuation(uint128_t a, uint128_t b) {
    // XOR via the struct's operator^
    return clz128(a ^ b);
}

/**
 * @brief Computes the ultrametric distance between two p-Adic integers.
 * 
 * Math Note: The p-Adic distance is typically defined as p^(-v_p(x-y)). 
 * For sorting and top-K selection, it is computationally cheaper to use a 
 * monotonically decreasing function of the valuation. We define the integer 
 * distance as: d(a, b) = 128 - v_2(a, b).
 * 
 * PROOF OF THE STRONG TRIANGLE INEQUALITY:
 * We must prove that d(x, z) <= max(d(x, y), d(y, z)).
 * 1. By definition of XOR: (x XOR z) = (x XOR y) XOR (y XOR z).
 * 2. The number of leading zeros of a XOR sum is at least the minimum of the 
 *    leading zeros of its operands: clz(A XOR B) >= min(clz(A), clz(B)).
 * 3. Therefore: clz(x XOR z) >= min(clz(x XOR y), clz(y XOR z)).
 * 4. Multiplying by -1 reverses the inequality: 
 *    -clz(x XOR z) <= -min(clz(x XOR y), clz(y XOR z))
 * 5. -min(A, B) is equivalent to max(-A, -B). Thus:
 *    -clz(x XOR z) <= max(-clz(x XOR y), -clz(y XOR z)).
 * 6. Adding 128 to all sides yields:
 *    128 - clz(x XOR z) <= max(128 - clz(x XOR y), 128 - clz(y XOR z)).
 * 7. Substituting our distance function: d(x, z) <= max(d(x, y), d(y, z)). Q.E.D.
 */
__device__ __forceinline__ int ultrametric_distance(uint128_t a, uint128_t b) {
    return 128 - padic_valuation(a, b);
}

} // namespace padic::device