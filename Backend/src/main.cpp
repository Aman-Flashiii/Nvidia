// ==============================================================================
// File: main.cpp
// Description: Application entry point. Initializes CUDA, loads the bulk binary 
//              dataset, and starts the HTTP server. Handles graceful shutdown.
// ==============================================================================
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <memory>
#include <csignal>

#include "core/padic_quantizer.h"
#include "cuda/padic_engine.h"
#include "server/http_server.h"
#include "utils/logger.h"

// Global pointer for POSIX signal handling
padic::server::HttpServer* g_server = nullptr;

void signal_handler(int signum) {
    LOG_INFO("Caught signal ", signum, ", shutting down gracefully...");
    if (g_server) {
        g_server->stop();
    }
}

/**
 * @brief Loads the binary dataset format defined in data/README.md.
 * Format: [uint32 num_vectors][uint32 dimension][float32 data...]
 */
bool load_binary_dataset(const std::string& filepath, std::vector<std::vector<float>>& out_vectors) {
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) {
        LOG_ERROR("Failed to open dataset file: ", filepath);
        return false;
    }

    uint32_t num_vectors, dimension;
    file.read(reinterpret_cast<char*>(&num_vectors), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&dimension), sizeof(uint32_t));

    if (dimension != static_cast<uint32_t>(padic::core::PAdicQuantizer::get_target_dim())) {
        LOG_ERROR("Dataset dimension (", dimension, ") does not match quantizer target dimension (", 
                  padic::core::PAdicQuantizer::get_target_dim(), ").");
        return false;
    }

    LOG_INFO("Loading ", num_vectors, " vectors of dimension ", dimension, " from ", filepath);

    out_vectors.resize(num_vectors);
    std::vector<float> buffer(dimension);
    
    for (uint32_t i = 0; i < num_vectors; ++i) {
        file.read(reinterpret_cast<char*>(buffer.data()), dimension * sizeof(float));
        out_vectors[i] = buffer;
    }

    return true;
}

int main(int argc, char* argv[]) {
    // Setup logging
    padic::utils::Logger::instance().set_level(padic::utils::LogLevel::INFO);

    // Parse command-line arguments
    std::string dataset_path = "";
    int port = 8080;
    std::string host = "0.0.0.0";

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--dataset" && i + 1 < argc) {
            dataset_path = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if (arg == "--host" && i + 1 < argc) {
            host = argv[++i];
        }
    }

    try {
        // 1. Initialize Core Components
        LOG_INFO("Initializing p-Adic Quantizer...");
        auto quantizer = std::make_shared<padic::core::PAdicQuantizer>();

        LOG_INFO("Initializing CUDA p-Adic Engine...");
        auto engine = std::make_shared<padic::cuda::PAdicEngine>();

        // 2. Load initial dataset if provided
        if (!dataset_path.empty()) {
            std::vector<std::vector<float>> vectors;
            if (load_binary_dataset(dataset_path, vectors)) {
                LOG_INFO("Quantizing dataset...");
                auto quantized = quantizer->quantize_batch(vectors);
                
                LOG_INFO("Loading quantized dataset into GPU...");
                engine->load_dataset(quantized);
            } else {
                LOG_WARN("Proceeding without initial dataset. Use /ingest endpoint to load data.");
            }
        } else {
            LOG_WARN("No dataset path provided. Use /ingest endpoint to load data.");
        }

        // 3. Initialize and start HTTP Server
        LOG_INFO("Initializing HTTP Server...");
        auto server = std::make_unique<padic::server::HttpServer>(quantizer, engine);
        g_server = server.get();

        // Register signal handlers for graceful shutdown (Ctrl+C)
        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);

        LOG_INFO("System ready. Starting server on ", host, ":", port);
        server->start(host, port);

    } catch (const std::exception& e) {
        LOG_ERROR("Fatal error: ", e.what());
        return 1;
    }

    LOG_INFO("Server stopped. Exiting.");
    return 0;
}