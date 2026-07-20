// ==============================================================================
// File: memory_mapper.h
// Description: Header for the number-theoretic shared memory bank swizzling logic.
//              Uses a prime-based bijective mapping to eliminate shared memory
//              bank conflicts during warp-level p-Adic distance computation.
// ==============================================================================
#pragma once

#include <cstdint>

namespace padic::core {

class MemoryMapper {
public:
    // Number of shared memory banks on all NVIDIA GPUs since Fermi (2010).
    static constexpr uint32_t NUM_BANKS = 32;

    /**
     * @brief Constructs a MemoryMapper with a given odd multiplier.
     *
     * @param multiplier Must be coprime to 32 (i.e., odd).
     *                   Recommended value: 3 (primitive root mod 32).
     * @throws std::invalid_argument if multiplier is even.
     */
    explicit MemoryMapper(uint32_t multiplier = 3);

    /**
     * @brief Maps a logical address to a physical bank index.
     *
     * Formula: bank = (logical_address * multiplier_) % NUM_BANKS
     * Because gcd(multiplier_, 32) == 1 this is a bijection over [0, 32).
     *
     * @param logical_address  The un-swizzled bank index (0–31).
     * @return Physical bank index (0–31).
     */
    uint32_t map_to_bank(uint32_t logical_address) const;

    /**
     * @brief Swizzles a flat logical address to a conflict-free physical address.
     *
     * Decomposes the address into (row, col), permutes the column via
     * map_to_bank(), then reconstructs the physical address.
     *
     * @param logical_address  Flat index into shared memory.
     * @param stride           Row width (typically 32 for warp-aligned access).
     * @return Swizzled physical address.
     */
    uint32_t swizzle_address(uint32_t logical_address, uint32_t stride) const;

    /** @brief Returns the configured multiplier. */
    uint32_t get_multiplier() const;

private:
    uint32_t multiplier_;
};

} // namespace padic::core
