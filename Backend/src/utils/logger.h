// ==============================================================================
// File: logger.h
// Description: Thread-safe, lightweight logging utility using C++20 features.
//              Uses a singleton pattern and a mutex to prevent interleaved 
//              output from concurrent HTTP threads and CUDA host callbacks.
// ==============================================================================
#pragma once

#include <iostream>
#include <mutex>
#include <string>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace padic::utils {

#ifdef ERROR
#  undef ERROR
#endif

enum class LogLevel {
    DEBUG = 0,
    INFO  = 1,
    WARN  = 2,
    ERROR = 3
};


class Logger {
public:
    // Singleton instance
    static Logger& instance() {
        static Logger logger;
        return logger;
    }

    // Set the minimum logging level
    void set_level(LogLevel level) { 
        current_level_ = level; 
    }

    // Core logging function using C++20 variadic templates and fold expressions
    template <typename... Args>
    void log(LogLevel level, const std::string& file, int line, Args&&... args) {
        if (level < current_level_) return;

        // Lock mutex to ensure thread-safe console output
        std::lock_guard<std::mutex> lock(mutex_);
        
        // Generate high-resolution timestamp
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
        
        // Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] Message (file:line)
        std::cerr << "[" << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S")
                  << "." << std::setfill('0') << std::setw(3) << ms.count() << "] ";
                  
        switch (level) {
            case LogLevel::DEBUG: std::cerr << "[DEBUG] "; break;
            case LogLevel::INFO:  std::cerr << "[INFO]  "; break;
            case LogLevel::WARN:  std::cerr << "[WARN]  "; break;
            case LogLevel::ERROR: std::cerr << "[ERROR] "; break;
        }
        
        // C++20 Fold expression to stream all arguments seamlessly
        (std::cerr << ... << std::forward<Args>(args));
        
        std::cerr << " (" << file << ":" << line << ")\n";
    }

private:
    Logger() = default;
    ~Logger() = default;
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    std::mutex mutex_;
    LogLevel current_level_ = LogLevel::INFO;
};

} // namespace padic::utils

// ------------------------------------------------------------------------------
// Convenience Macros
// ------------------------------------------------------------------------------
#define LOG_DEBUG(...) ::padic::utils::Logger::instance().log(::padic::utils::LogLevel::DEBUG, __FILE__, __LINE__, __VA_ARGS__)
#define LOG_INFO(...)  ::padic::utils::Logger::instance().log(::padic::utils::LogLevel::INFO, __FILE__, __LINE__, __VA_ARGS__)
#define LOG_WARN(...)  ::padic::utils::Logger::instance().log(::padic::utils::LogLevel::WARN, __FILE__, __LINE__, __VA_ARGS__)
#define LOG_ERROR(...) ::padic::utils::Logger::instance().log(::padic::utils::LogLevel::ERROR, __FILE__, __LINE__, __VA_ARGS__)