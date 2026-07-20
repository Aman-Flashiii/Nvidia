# ==============================================================================
# Project: p-Adic Ultrametric Vector Search
# File: CMakeLists.txt
# Description: Root build configuration. Enforces C++20, configures CUDA, and 
#              fetches header-only dependencies (nlohmann_json, cpp-httplib).
# ==============================================================================

cmake_minimum_required(VERSION 3.24)
project(padic_vector_search LANGUAGES CXX CUDA)

# Enforce C++20 for both Host (C++) and Device (CUDA) code
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_CUDA_STANDARD 20)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

# Find the CUDA Toolkit so that CUDA::cudart and other imported targets
# (CUDA::cublas, CUDA::curand, etc.) are available for target_link_libraries.
find_package(CUDAToolkit REQUIRED)

# Set default CUDA architecture to sm_80 (Ampere A100) if not provided.
# Users can override this via -DCMAKE_CUDA_ARCHITECTURES="75;80;86"
if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
    set(CMAKE_CUDA_ARCHITECTURES 80)
endif()

# ------------------------------------------------------------------------------
# Dependency Management via FetchContent
# ------------------------------------------------------------------------------
include(FetchContent)

# 1. nlohmann/json: High-performance JSON parsing
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)

# 2. cpp-httplib: Zero-dependency (except standard libs) HTTP server
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.15.3
)

# Make dependencies available
FetchContent_MakeAvailable(json httplib)

# ------------------------------------------------------------------------------
# Source File Discovery
# ------------------------------------------------------------------------------
# Globbing is generally discouraged in CMake, but for a self-contained project 
# structure where files are added manually, it keeps the CMakeLists clean.
file(GLOB_RECURSE CPP_SOURCES  CONFIGURE_DEPENDS "src/*.cpp")
file(GLOB_RECURSE CUDA_SOURCES CONFIGURE_DEPENDS "src/*.cu")

# ------------------------------------------------------------------------------
# Executable Target
# ------------------------------------------------------------------------------
add_executable(padic_search 
    ${CPP_SOURCES}
    ${CUDA_SOURCES}
)

# Include directories
target_include_directories(padic_search PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Link libraries
target_link_libraries(padic_search PRIVATE
    nlohmann_json::nlohmann_json
    httplib::httplib
    CUDA::cudart
)

# ------------------------------------------------------------------------------
# Compiler Flags  (MSVC-safe — works for both cl.exe and GCC/Clang)
# ------------------------------------------------------------------------------
target_compile_options(padic_search PRIVATE
    # --- C++ Host Code ---
    $<$<AND:$<COMPILE_LANGUAGE:CXX>,$<CXX_COMPILER_ID:MSVC>>:
        /W4       # Warning level 4 (equivalent to -Wall)
        /O2       # Optimise for speed (equivalent to -O3 for MSVC)
        /WX-      # Treat warnings as errors: off (keep build clean during dev)
    >
    $<$<AND:$<COMPILE_LANGUAGE:CXX>,$<NOT:$<CXX_COMPILER_ID:MSVC>>>:
        -Wall -Wextra -Wpedantic -O3
    >
    # --- CUDA Device Code ---
    # --use_fast_math and --expt-relaxed-constexpr are nvcc flags (always valid).
    # -Xcompiler passes flags to the HOST compiler, so we must guard them too.
    $<$<COMPILE_LANGUAGE:CUDA>:
        --use_fast_math
        --expt-relaxed-constexpr
        -Xcompiler=$<IF:$<CXX_COMPILER_ID:MSVC>,/O2,-O3>
    >

)