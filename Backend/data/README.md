# Dataset Formatting Instructions

## Bulk Ingestion (Binary Format)
For initial high-performance bulk loading of the vector dataset (Dataset A), the system expects a raw binary file to minimize I/O overhead and parsing latency.

**File Structure:**
1. `uint32_t num_vectors` : Total number of vectors in the dataset.
2. `uint32_t dimension`   : The dimensionality of each vector (e.g., 128, 768).
3. `float32_t[] data`     : A contiguous array of `num_vectors * dimension` floats in row-major order.

**Example Generation (Python):**
```python
import numpy as np

num_vectors = 1000000
dimension = 128
# Generate random FP32 vectors
data = np.random.randn(num_vectors, dimension).astype(np.float32)

with open('dataset_a.bin', 'wb') as f:
    f.write(np.uint32(num_vectors).tobytes())
    f.write(np.uint32(dimension).tobytes())
    f.write(data.tobytes())