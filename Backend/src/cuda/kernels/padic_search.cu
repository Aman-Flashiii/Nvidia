// ==============================================================================
// File: padic_search.cu
// Description: Core CUDA kernel for p-Adic vector search. Implements warp-level 
//              parallel trie traversal and REGISTER-BASED TOP-K SORTING.
//              Each thread maintains a local top-K array in registers, and the 
//              warp uses __shfl_sync to extract the global top-K without shared 
//              memory or global atomics.
// ==============================================================================
#include "padic_math.cuh"
#include <cstdint>

namespace padic::device {

// Each thread maintains a local sorted array of this size in registers.
// 16 is chosen as a sweet spot: large enough to capture local minima, 
// small enough to fit entirely in the register file without spilling.
constexpr int THREAD_LOCAL_K = 16;

// The maximum number of candidates each warp will output to global memory.
// Capped at 32 to minimize D2H PCIe transfer overhead. The host will perform 
// the final reduction.
constexpr int WARP_OUTPUT_K = 32;

/**
 * @brief The main p-Adic search CUDA kernel with Register-Based Top-K.
 */
extern "C" __global__ void padic_search_kernel(
    const uint128_t* dataset,   // Device pointer to the quantized dataset
    uint128_t query,            // The quantized query vector (passed by value)
    uint32_t num_vectors,       // Total number of vectors in the dataset
    uint32_t k,                 // Number of top neighbors requested by user
    uint32_t* top_k_indices,    // Output array for indices
    uint32_t* top_k_distances)  // Output array for distances
{
    uint32_t tid = blockIdx.x * blockDim.x + threadIdx.x;
    uint32_t lane_id = threadIdx.x & 31; 
    uint32_t warp_id = (blockIdx.x * blockDim.x + threadIdx.x) >> 5;

    // --------------------------------------------------------------------------
    // 1. Initialize Thread-Local Register Arrays
    // --------------------------------------------------------------------------
    // Each thread keeps its own sorted list of the best candidates it has seen.
    int local_dists[THREAD_LOCAL_K];
    uint32_t local_idxs[THREAD_LOCAL_K];

    // Initialize to "infinity" (max possible distance is 128, so 129 is safe)
    for (int i = 0; i < THREAD_LOCAL_K; ++i) {
        local_dists[i] = 129;
        local_idxs[i] = 0xFFFFFFFF;
    }

    // --------------------------------------------------------------------------
    // 2. Grid-Stride Loop with Register-Based Insertion Sort
    // --------------------------------------------------------------------------
    for (uint32_t i = tid; i < num_vectors; i += blockDim.x * gridDim.x) {
        uint128_t vec = dataset[i];
        
        // Calculate full 128-bit ultrametric distance
        int dist = ultrametric_distance(query, vec);
        
        // If this distance is better than the worst candidate in our local top-K
        if (dist < local_dists[THREAD_LOCAL_K - 1]) {
            // Insert at the end
            local_dists[THREAD_LOCAL_K - 1] = dist;
            local_idxs[THREAD_LOCAL_K - 1] = i;
            
            // Bubble up to maintain sorted order (ascending distance).
            // Because THREAD_LOCAL_K is a compile-time constant, the compiler 
            // will completely unroll this loop into pure register moves.
            for (int j = THREAD_LOCAL_K - 1; j > 0; --j) {
                bool should_swap = (local_dists[j] < local_dists[j-1]) || 
                                   (local_dists[j] == local_dists[j-1] && local_idxs[j] < local_idxs[j-1]);
                if (should_swap) {
                    int tmp_d = local_dists[j]; local_dists[j] = local_dists[j-1]; local_dists[j-1] = tmp_d;
                    uint32_t tmp_i = local_idxs[j]; local_idxs[j] = local_idxs[j-1]; local_idxs[j-1] = tmp_i;
                } else {
                    break; // Array is sorted, stop bubbling
                }
            }
        }
    }

    // --------------------------------------------------------------------------
    // 3. Warp-Level Top-K Extraction (Shuffle Tournament)
    // --------------------------------------------------------------------------
    // We want to extract the top 'k' candidates for this warp. 
    // We cap it at WARP_OUTPUT_K (32) to bound global memory writes.
    int warp_k = (k < WARP_OUTPUT_K) ? k : WARP_OUTPUT_K;

    for (int iter = 0; iter < warp_k; ++iter) {
        // Each thread presents its current best candidate (index 0 of its local array)
        int curr_min_dist = local_dists[0];
        uint32_t curr_min_idx = local_idxs[0];
        
        // Warp-level reduction to find the global minimum across all 32 lanes
        for (int offset = 16; offset > 0; offset /= 2) {
            int other_dist = __shfl_down_sync(0xffffffff, curr_min_dist, offset);
            uint32_t other_idx = __shfl_down_sync(0xffffffff, curr_min_idx, offset);
            
            if (other_dist < curr_min_dist || (other_dist == curr_min_dist && other_idx < curr_min_idx)) {
                curr_min_dist = other_dist;
                curr_min_idx = other_idx;
            }
        }
        // Broadcast the final winner to all lanes
        curr_min_dist = __shfl_sync(0xffffffff, curr_min_dist, 0);
        curr_min_idx = __shfl_sync(0xffffffff, curr_min_idx, 0);
        
        // Lane 0 writes the winner to global memory
        if (lane_id == 0) {
            top_k_indices[warp_id * warp_k + iter] = curr_min_idx;
            top_k_distances[warp_id * warp_k + iter] = curr_min_dist;
        }
        
        // Invalidate the winner in the specific thread that holds it, 
        // and bubble up the next best candidate to index 0.
        if (local_idxs[0] == curr_min_idx) {
            local_dists[0] = 129; // Reset to infinity
            local_idxs[0] = 0xFFFFFFFF;
            
            // Bubble up the next best candidate
            for (int j = 0; j < THREAD_LOCAL_K - 1; ++j) {
                bool should_swap = (local_dists[j] > local_dists[j+1]) || 
                                   (local_dists[j] == local_dists[j+1] && local_idxs[j] > local_idxs[j+1]);
                if (should_swap) {
                    int tmp_d = local_dists[j]; local_dists[j] = local_dists[j+1]; local_dists[j+1] = tmp_d;
                    uint32_t tmp_i = local_idxs[j]; local_idxs[j] = local_idxs[j+1]; local_idxs[j+1] = tmp_i;
                } else {
                    break;
                }
            }
        }
    }
}

} // namespace padic::device