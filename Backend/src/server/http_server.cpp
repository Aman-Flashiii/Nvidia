// ==============================================================================
// File: http_server.cpp
// Description: Implementation of the REST API routes. Handles JSON parsing, 
//              error handling, and routing to the CUDA engine.
// ==============================================================================
#include "http_server.h"
#include "../utils/json_utils.h"
#include "../utils/logger.h"
#include <fstream>

namespace padic::server {

HttpServer::HttpServer(std::shared_ptr<core::PAdicQuantizer> quantizer, 
                       std::shared_ptr<cuda::PAdicEngine> engine)
    : quantizer_(std::move(quantizer)), engine_(std::move(engine)) {
    
    start_time_ = std::chrono::steady_clock::now();

    // ---------------------------------------------------------------------------
    // CORS — allow the Next.js dev server (port 3000) and any other origin to
    // call this C++ server directly.  The pre-flight OPTIONS handler is required
    // by browsers before they send cross-origin POST/PUT/DELETE requests.
    // ---------------------------------------------------------------------------
    auto add_cors = [](httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin",  "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.set_header("Access-Control-Max-Age",       "86400");
    };

    // Pre-flight handler for every route
    svr_.Options(".*", [add_cors](const auto& /*req*/, auto& res) {
        add_cors(res);
        res.status = 204; // No Content
    });

    // Set CORS headers on every response automatically
    svr_.set_post_routing_handler([add_cors](const auto& /*req*/, auto& res) {
        add_cors(res);
    });

    // Register routes
    svr_.Post("/search", [this](const auto& req, auto& res) { handle_search(req, res); });
    svr_.Post("/ingest", [this](const auto& req, auto& res) { handle_ingest(req, res); });
    svr_.Get("/metrics", [this](const auto& req, auto& res) { handle_metrics(req, res); });

    // Global error handler for uncaught exceptions
    svr_.set_error_handler([add_cors](const auto& /*req*/, auto& res) {
        add_cors(res);
        res.status = 500;
        res.set_content(utils::create_error_response("Internal Server Error").dump(), "application/json");
    });
}

void HttpServer::start(const std::string& host, int port) {
    LOG_INFO("Starting HTTP server on ", host, ":", port);
    svr_.listen(host, port);
}

void HttpServer::stop() {
    svr_.stop();
}

// ------------------------------------------------------------------------------
// POST /search
// Accepts: {"vector": [0.1, -0.5, ...], "k": 10}
// Returns: {"status": "success", "data": {"results": [{"index": 5, "distance": 2}, ...]}}
// ------------------------------------------------------------------------------
void HttpServer::handle_search(const httplib::Request& req, httplib::Response& res) {
    try {
        auto body = utils::Json::parse(req.body);
        
        if (!body.contains("vector") || !body.contains("k")) {
            res.status = 400;
            res.set_content(utils::create_error_response("Missing 'vector' or 'k' in JSON payload.").dump(), "application/json");
            return;
        }

        // 1. Parse and validate the query vector
        auto vec = utils::json_to_floats(body["vector"]);
        uint32_t k = body["k"].get<uint32_t>();

        // 2. Quantize the FP32 vector into a 128-bit p-Adic integer
        auto query_padic = quantizer_->quantize(vec);

        // 3. Launch the CUDA kernel and retrieve Top-K results
        auto results = engine_->search(query_padic, k);

        // 4. Serialize results to JSON
        utils::Json response_data = utils::Json::array();
        for (const auto& r : results) {
            response_data.push_back({{"index", r.index}, {"distance", r.distance}});
        }

        res.set_content(utils::create_success_response("Search completed", response_data).dump(), "application/json");
    } catch (const std::exception& e) {
        LOG_ERROR("Search error: ", e.what());
        res.status = 400;
        res.set_content(utils::create_error_response(e.what()).dump(), "application/json");
    }
}

// ------------------------------------------------------------------------------
// POST /ingest
// Accepts: {"vectors": [[0.1, ...], [-0.2, ...], ...]}
// Note: For massive datasets, use the binary file loader in main.cpp.
// ------------------------------------------------------------------------------
void HttpServer::handle_ingest(const httplib::Request& req, httplib::Response& res) {
    // Lock mutex to prevent concurrent dataset overwrites
    std::lock_guard<std::mutex> lock(ingest_mutex_);
    try {
        auto body = utils::Json::parse(req.body);
        
        if (!body.contains("vectors")) {
            res.status = 400;
            res.set_content(utils::create_error_response("Missing 'vectors' array in JSON payload.").dump(), "application/json");
            return;
        }

        auto json_vectors = body["vectors"];
        std::vector<std::vector<float>> batch;
        batch.reserve(json_vectors.size());
        
        for (const auto& j_vec : json_vectors) {
            batch.push_back(utils::json_to_floats(j_vec));
        }

        // Quantize and load into GPU
        auto quantized_batch = quantizer_->quantize_batch(batch);
        engine_->load_dataset(quantized_batch);

        res.set_content(utils::create_success_response("Dataset ingested successfully", {{"size", quantized_batch.size()}}).dump(), "application/json");
    } catch (const std::exception& e) {
        LOG_ERROR("Ingest error: ", e.what());
        res.status = 400;
        res.set_content(utils::create_error_response(e.what()).dump(), "application/json");
    }
}

// ------------------------------------------------------------------------------
// GET /metrics
// Returns: System health, dataset size, uptime, etc.
// ------------------------------------------------------------------------------
void HttpServer::handle_metrics(const httplib::Request& req, httplib::Response& res) {
    auto now = std::chrono::steady_clock::now();
    auto uptime = std::chrono::duration_cast<std::chrono::seconds>(now - start_time_).count();

    utils::Json data;
    data["dataset_size"] = engine_->get_dataset_size();
    data["uptime_seconds"] = uptime;
    data["quantizer_target_dim"] = core::PAdicQuantizer::get_target_dim();

    res.set_content(utils::create_success_response("Metrics retrieved", data).dump(), "application/json");
}

} // namespace padic::server  