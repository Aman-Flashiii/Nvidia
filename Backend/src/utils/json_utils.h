// ==============================================================================
// File: json_utils.h
// Description: Helper functions for parsing and serializing nlohmann::json.
//              Enforces strict typing for the REST API to prevent malformed 
//              requests from crashing the CUDA pipeline.
// ==============================================================================
#pragma once

#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <stdexcept>

namespace padic::utils {

using Json = nlohmann::json;

// Convert a std::vector<float> to a JSON array
inline Json floats_to_json(const std::vector<float>& vec) {
    return Json(vec);
}

// Parse a JSON array into a std::vector<float> with strict type checking
inline std::vector<float> json_to_floats(const Json& j) {
    if (!j.is_array()) {
        throw std::invalid_argument("JSON payload must be an array of numbers.");
    }
    
    std::vector<float> result;
    result.reserve(j.size());
    
    for (const auto& item : j) {
        if (!item.is_number()) {
            throw std::invalid_argument("All elements in the JSON array must be numbers.");
        }
        // Cast to float (handles both int and float JSON types)
        result.push_back(item.get<float>());
    }
    
    return result;
}

// Helper to create a standard success JSON response
inline Json create_success_response(const std::string& message, const Json& data = nullptr) {
    Json res;
    res["status"] = "success";
    res["message"] = message;
    if (!data.is_null()) {
        res["data"] = data;
    }
    return res;
}

// Helper to create a standard error JSON response
inline Json create_error_response(const std::string& message) {
    Json res;
    res["status"] = "error";
    res["message"] = message;
    return res;
}

} // namespace padic::utils