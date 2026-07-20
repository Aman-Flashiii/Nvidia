// ==============================================================================
// File: memory_mapper.cpp
// Description: Implementation of the number-theoretic memory swizzling logic.
// ==============================================================================
#include "memory_mapper.h"
#include <stdexcept>
#include <string>

namespace padic::core {

MemoryMapper::MemoryMapper(uint32_t multiplier) : multiplier_(multiplier) {
    // Verify that the multiplier is coprime to 32.
    // Since 32 = 2^5, any odd number is strictly coprime to 32.
    // This is the fundamental requirement for the mapping to be a bijection.
    if (multiplier_ % 2 == 0) {
        throw std::invalid_argument(
            "MemoryMapper Error: Multiplier (" + std::to_string(multiplier_) + 
            ") must be coprime to 32 (i.e., it must be an odd number)."
        );
    }
}

uint32_t MemoryMapper::map_to_bank(uint32_t logical_address) const {
    // The core number-theoretic mapping formula.
    // Because multiplier_ is odd, gcd(multiplier_, 32) = 1.
    // This guarantees the mapping is a bijection (permutation) of the 32 banks.
    // Example with multiplier = 3:
    // Logical: 0, 1, 2, 3, 4, 5...
    // Physical: 0, 3, 6, 9, 12, 15... (mod 32)
    return (logical_address * multiplier_) % NUM_BANKS;
}

uint32_t MemoryMapper::swizzle_address(uint32_t logical_address, uint32_t stride) const {
    // Decompose the logical address into row and column (bank) components.
    // We assume the logical address is laid out in a grid where each row has 
    // 'stride' elements. For warp-level operations, stride is typically 32.
    uint32_t row = logical_address / NUM_BANKS;
    uint32_t col = logical_address % NUM_BANKS;
    
    // Apply the number-theoretic permutation to the column (bank index).
    uint32_t swizzled_col = map_to_bank(col);
    
    // Reconstruct the physical address using the swizzled column.
    // This ensures that when threads in a warp access consecutive logical 
    // addresses (stride 1), they are mapped to non-conflicting physical banks.
    return (row * stride) + swizzled_col;
}

uint32_t MemoryMapper::get_multiplier() const {
    return multiplier_;
}

} // namespace padic::core