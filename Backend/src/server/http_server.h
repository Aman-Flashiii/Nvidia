// ==============================================================================
// File: http_server.h
// Description: Header for the REST API wrapper. Uses cpp-httplib to expose the 
//              p-Adic CUDA engine via standard HTTP endpoints.
// ==============================================================================
#pragma once

#include <httplib.h>
#include <memory>
#include <mutex>
#include <chrono>

#include "../core/padic_quantizer.h"
#include "../cuda/padic_engine.h"

namespace padic::server {

class HttpServer {
public:
    /**
     * @brief Constructs the HTTP server with shared pointers to the core components.
     */
    HttpServer(std::shared_ptr<core::PAdicQuantizer> quantizer, 
               std::shared_ptr<cuda::PAdicEngine> engine);
    
    /**
     * @brief Starts the HTTP server on the specified host and port. Blocks until stopped.
     */
    void start(const std::string& host, int port);

    /**
     * @brief Signals the server to stop listening and unblocks the start() method.
     */
    void stop();

private:
    // Route Handlers
    void handle_search(const httplib::Request& req, httplib::Response& res);
    void handle_ingest(const httplib::Request& req, httplib::Response& res);
    void handle_metrics(const httplib::Request& req, httplib::Response& res);

    // Core components
    std::shared_ptr<core::PAdicQuantizer> quantizer_;
    std::shared_ptr<cuda::PAdicEngine> engine_;
    
    // Server instance and thread-safety
    httplib::Server svr_;
    std::mutex ingest_mutex_; // Protects engine_->load_dataset from concurrent writes
    
    // Metrics tracking
    std::chrono::steady_clock::time_point start_time_;
};

} // namespace padic::server