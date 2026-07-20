// ==============================================================================
// File: cuda_check.h
// Description: Macros for checking CUDA API calls and asynchronous kernel 
//              execution errors. Translates cudaError_t into C++ exceptions 
//              with detailed file, line, and error string context.
// ==============================================================================
#pragma once

#include <cuda_runtime.h>
#include <stdexcept>
#include <string>
#include <sstream>

namespace padic::cuda {

// Helper to safely convert cudaError_t to a readable string
inline const char* cuda_error_to_string(cudaError_t error) {
    return cudaGetErrorString(error);
}

// ------------------------------------------------------------------------------
// CUDA_CHECK(call)
// Checks the return value of synchronous CUDA API calls (e.g., cudaMalloc).
// Throws std::runtime_error on failure.
// ------------------------------------------------------------------------------
#define CUDA_CHECK(call) \
    do { \
        cudaError_t err = call; \
        if (err != cudaSuccess) { \
            std::ostringstream oss; \
            oss << "CUDA API Error in " << __FILE__ << " at line " << __LINE__ << ": " \
                << ::padic::cuda::cuda_error_to_string(err) << " (Code: " << err << ") " \
                << "during call '" << #call << "'"; \
            throw std::runtime_error(oss.str()); \
        } \
    } while (0)

// ------------------------------------------------------------------------------
// CUDA_CHECK_LAST()
// Checks for errors from asynchronous operations (e.g., kernel launches).
// 1. Checks cudaGetLastError() for configuration/launch errors.
// 2. Calls cudaDeviceSynchronize() to catch execution errors inside the kernel.
// Throws std::runtime_error on failure.
// ------------------------------------------------------------------------------
#define CUDA_CHECK_LAST() \
    do { \
        cudaError_t err = cudaGetLastError(); \
        if (err != cudaSuccess) { \
            std::ostringstream oss; \
            oss << "CUDA Launch Error in " << __FILE__ << " at line " << __LINE__ << ": " \
                << ::padic::cuda::cuda_error_to_string(err) << " (Code: " << err << ")"; \
            throw std::runtime_error(oss.str()); \
        } \
        err = cudaDeviceSynchronize(); \
        if (err != cudaSuccess) { \
            std::ostringstream oss; \
            oss << "CUDA Execution Error in " << __FILE__ << " at line " << __LINE__ << ": " \
                << ::padic::cuda::cuda_error_to_string(err) << " (Code: " << err << ")"; \
            throw std::runtime_error(oss.str()); \
        } \
    } while (0)

} // namespace padic::cuda