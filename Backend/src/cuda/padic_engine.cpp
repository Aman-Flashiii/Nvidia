// ==============================================================================
// File: padic_engine.cpp
// Description: Implementation of the CUDA host engine. Updated to manage the 
//              Warp-Level Top-K output buffers and perform the final host-side 
//              partial sort to extract the absolute Top-K.
// ==============================================================================
#include "padic_engine.h"
#include "utils/cuda_check.h"
#include "../utils/logger.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>

namespace padic::device {
    extern "C" void padic_search_kernel(
        const ::uint128_t* dataset,
        ::uint128_t query,
        uint32_t num_vectors,
        uint32_t k,
        uint32_t* top_k_indices,
        uint32_t* top_k_distances);
}

namespace padic::cuda {

// Execution configuration constants
constexpr uint32_t BLOCK_SIZE = 256;
constexpr uint32_t GRID_SIZE = 2048;
constexpr uint32_t TOTAL_WARPS = (BLOCK_SIZE * GRID_SIZE) / 32; // 16,384 warps

// Must match the kernel's WARP_OUTPUT_K constant
constexpr uint32_t WARP_OUTPUT_K = 32; 

PAdicEngine::PAdicEngine() 
    : d_dataset_(nullptr), d_indices_(nullptr), d_distances_(nullptr),
      dataset_size_(0), max_result_size_(0) {
    
    int device;
    CUDA_CHECK(cudaGetDevice(&device));
    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDeviceProperties(&prop, device));
    
    LOG_INFO("PAdicEngine initialized on GPU: ", prop.name, 
             " (Compute Capability ", prop.major, ".", prop.minor, ")");
}

PAdicEngine::~PAdicEngine() {
    if (d_dataset_) cudaFree(d_dataset_);
    if (d_indices_) cudaFree(d_indices_);
    if (d_distances_) cudaFree(d_distances_);
}

void PAdicEngine::load_dataset(const std::vector<uint128_t>& dataset) {
    dataset_size_ = dataset.size();
    if (dataset_size_ == 0) throw std::invalid_argument("Cannot load an empty dataset.");

    if (d_dataset_) CUDA_CHECK(cudaFree(d_dataset_));
    
    size_t bytes = dataset_size_ * sizeof(uint128_t);
    CUDA_CHECK(cudaMalloc(&d_dataset_, bytes));
    CUDA_CHECK(cudaMemcpy(d_dataset_, dataset.data(), bytes, cudaMemcpyHostToDevice));
    
    LOG_INFO("Loaded ", dataset_size_, " vectors into GPU memory (", 
             (bytes / (1024.0 * 1024.0)), " MB).");
}

std::vector<SearchResult> PAdicEngine::search(const uint128_t& query, uint32_t k) {
    if (!d_dataset_ || dataset_size_ == 0) {
        throw std::runtime_error("No dataset loaded. Call load_dataset() first.");
    }
    if (k == 0) return {};

    // The kernel caps its output per warp at WARP_OUTPUT_K (32).
    uint32_t actual_warp_k = std::min(k, WARP_OUTPUT_K);
    size_t total_candidates = TOTAL_WARPS * actual_warp_k;

    // Lazily allocate result buffers if they aren't large enough
    if (max_result_size_ < total_candidates) {
        if (d_indices_) cudaFree(d_indices_);
        if (d_distances_) cudaFree(d_distances_);
        
        CUDA_CHECK(cudaMalloc(&d_indices_, total_candidates * sizeof(uint32_t)));
        CUDA_CHECK(cudaMalloc(&d_distances_, total_candidates * sizeof(uint32_t)));
        
        max_result_size_ = total_candidates;
        h_indices_.resize(total_candidates);
        h_distances_.resize(total_candidates);
    }

    uint32_t num_vectors = static_cast<uint32_t>(dataset_size_);

    // Prepare kernel arguments
    void* args[] = {
        &d_dataset_,
        const_cast<uint128_t*>(&query),
        &num_vectors,
        &k, // Pass the user's requested K; the kernel will internally cap it to WARP_OUTPUT_K
        &d_indices_,
        &d_distances_
    };


    // Launch kernel
    CUDA_CHECK(cudaLaunchKernel(
        (void*)padic::device::padic_search_kernel,
        dim3(GRID_SIZE), dim3(BLOCK_SIZE), args, 0, 0
    ));
    CUDA_CHECK_LAST();

    // Copy the warp-level candidates back to host
    size_t bytes_to_copy = total_candidates * sizeof(uint32_t);
    CUDA_CHECK(cudaMemcpy(h_indices_.data(), d_indices_, bytes_to_copy, cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_distances_.data(), d_distances_, bytes_to_copy, cudaMemcpyDeviceToHost));

    // Combine into sortable structures
    std::vector<SearchResult> all_results(total_candidates);
    for (size_t i = 0; i < total_candidates; ++i) {
        all_results[i] = {h_indices_[i], static_cast<int>(h_distances_[i])};
    }

    // Final host-side reduction: O(N log K) partial sort
    size_t final_k = std::min(static_cast<size_t>(k), total_candidates);
    std::partial_sort(all_results.begin(), all_results.begin() + final_k, all_results.end(),
        [](const SearchResult& a, const SearchResult& b) {
            if (a.distance != b.distance) return a.distance < b.distance;
            return a.index < b.index;
        });

    all_results.resize(final_k);
    return all_results;
}

size_t PAdicEngine::get_dataset_size() const {
    return dataset_size_;
}

} // namespace padic::cuda