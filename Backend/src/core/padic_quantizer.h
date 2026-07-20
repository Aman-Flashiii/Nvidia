// ==============================================================================
// File: padic_quantizer.h
// Description: Maps continuous FP32 vectors into discrete 128-bit p-Adic integers.
//              This effectively embeds the vectors into a 128-dimensional binary 
//              hypercube, where the 2-adic ultrametric distance can be computed 
//              using bitwise primitives (XOR and __clz).
// ==============================================================================
#pragma once

#include <vector>
#include <cstdint>

// Define a portable 128-bit unsigned integer type.
//
// GCC/Clang on 64-bit targets support the built-in `unsigned __int128`, but
// MSVC does not.  We therefore use a struct of two uint64_t words (lo / hi)
// that compiles everywhere, including NVCC with MSVC as the host compiler.
//
// For CUDA device code the struct is marked __host__ __device__ so it can
// be used inside kernels without modification.

#ifdef _MSC_VER
#  include <intrin.h>
#endif

#ifdef __CUDACC__
#  define HOST_DEVICE __host__ __device__
#else
#  define HOST_DEVICE
#endif

struct uint128_t {
    uint64_t lo = 0;
    uint64_t hi = 0;

    // Default + value constructors
    HOST_DEVICE constexpr uint128_t() = default;
    HOST_DEVICE constexpr uint128_t(uint64_t l, uint64_t h = 0) : lo(l), hi(h) {}

    // Bitwise OR (used during quantization: result |= (1 << i))
    HOST_DEVICE uint128_t& operator|=(const uint128_t& rhs) {
        lo |= rhs.lo;
        hi |= rhs.hi;
        return *this;
    }
    HOST_DEVICE uint128_t operator|(const uint128_t& rhs) const {
        uint128_t r = *this;
        r |= rhs;
        return r;
    }

    // Bitwise XOR (used in distance kernel)
    HOST_DEVICE uint128_t operator^(const uint128_t& rhs) const {
        return {lo ^ rhs.lo, hi ^ rhs.hi};
    }

    HOST_DEVICE bool operator==(const uint128_t& rhs) const {
        return lo == rhs.lo && hi == rhs.hi;
    }
    HOST_DEVICE bool operator!=(const uint128_t& rhs) const { return !(*this == rhs); }
};

// Left-shift of a uint128_t by n bits  (0 <= n < 128)
// Used as:  static_cast<uint128_t>(1) << i
HOST_DEVICE inline uint128_t operator<<(const uint128_t& x, int n) {
    if (n == 0)  return x;
    if (n >= 128) return {0, 0};
    if (n >= 64)  return {0, x.lo << (n - 64)};
    // n < 64: shift lo up, carry spilled bits into hi
    return { x.lo << n, (x.hi << n) | (x.lo >> (64 - n)) };
}


namespace padic::core {

class PAdicQuantizer {
public:
    PAdicQuantizer();

    /**
     * @brief Quantizes a single FP32 vector into a 128-bit p-Adic integer.
     * 
     * @param vec A std::vector<float> of exactly 128 dimensions.
     * @return uint128_t The resulting 128-bit p-Adic integer.
     * 
     * Math Note: We use sign-based hashing (1 if >= 0, 0 if < 0). 
     * This preserves the angular similarity (cosine similarity) of the original 
     * vectors in the binary hypercube, which aligns perfectly with the 
     * ultrametric properties of the 2-adic metric.
     */
    uint128_t quantize(const std::vector<float>& vec) const;

    /**
     * @brief Batch quantization for multiple vectors.
     */
    std::vector<uint128_t> quantize_batch(const std::vector<std::vector<float>>& batch) const;

    // Get the target dimensionality (fixed at 128 for this architecture)
    static constexpr int get_target_dim() { return 128; }

private:
    int target_dim_;
};

} // namespace padic::core