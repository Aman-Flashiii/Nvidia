// ==============================================================================
// File: padic_quantizer.cpp
// Description: Implementation of the p-Adic quantizer.
// ==============================================================================
#include "padic_quantizer.h"
#include <stdexcept>
#include <string>

namespace padic::core {

PAdicQuantizer::PAdicQuantizer() : target_dim_(128) {
    // The quantizer is initialized with a fixed target dimension of 128.
    // This aligns with the 128-bit unsigned integer type used for bitwise operations.
}

uint128_t PAdicQuantizer::quantize(const std::vector<float>& vec) const {
    if (static_cast<int>(vec.size()) != target_dim_) {
        throw std::invalid_argument(
            "Input vector dimension must be exactly " + std::to_string(target_dim_) + 
            ". Received: " + std::to_string(vec.size())
        );
    }

    uint128_t result{}; // zero-initialised via default ctor {lo=0, hi=0}
    
    // Map each float to a single bit.
    // Bit i is set to 1 if vec[i] >= 0.0, else 0.
    // This creates a binary embedding. The most significant bits (higher indices) 
    // will represent the coarsest divisions in the p-Adic trie, which is why 
    // the CUDA kernel will use __clz (Count Leading Zeros) to find the 
    // longest common prefix (the p-Adic valuation).
    for (int i = 0; i < target_dim_; ++i) {
        if (vec[i] >= 0.0f) {
            // Set the i-th bit using the portable operator<< defined in padic_quantizer.h.
            result |= (uint128_t{1} << i);
        }
    }
    
    return result;
}


std::vector<uint128_t> PAdicQuantizer::quantize_batch(const std::vector<std::vector<float>>& batch) const {
    std::vector<uint128_t> results;
    results.reserve(batch.size());
    
    for (const auto& vec : batch) {
        results.push_back(quantize(vec));
    }
    
    return results;
}

} // namespace padic::core