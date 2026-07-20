// ==============================================================================
// File: padic_engine.h
// Description: Host-side wrapper for CUDA memory management. Updated to handle 
//              the larger output buffer required by the Warp-Level Top-K engine.
// ==============================================================================
#pragma once

#include <vector>
#include <cstdint>
#include "../core/padic_quantizer.h"

namespace padic::cuda {

struct SearchResult {
    uint32_t index;
    int distance;
};

class PAdicEngine {
public:
    PAdicEngine();
    ~PAdicEngine();

    PAdicEngine(const PAdicEngine&) = delete;
    PAdicEngine& operator=(const PAdicEngine&) = delete;

    void load_dataset(const std::vector<uint128_t>& dataset);
    std::vector<SearchResult> search(const uint128_t& query, uint32_t k);
    size_t get_dataset_size() const;

private:
    uint128_t* d_dataset_;
    uint32_t* d_indices_;
    uint32_t* d_distances_;
    
    size_t dataset_size_;
    size_t max_result_size_; 
    
    std::vector<uint32_t> h_indices_;
    std::vector<uint32_t> h_distances_;
};

} // namespace padic::cuda