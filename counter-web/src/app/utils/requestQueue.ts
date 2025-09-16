export class RequestQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private processing = false;
  private maxConcurrent = 3;
  private currentRequests = 0;
  private delayBetweenRequests = 200; // 200ms between requests

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.currentRequests >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.currentRequests < this.maxConcurrent) {
      const request = this.queue.shift();
      if (request) {
        this.currentRequests++;

        // Process request with delay
        request()
          .finally(() => {
            this.currentRequests--;
            // Continue processing after delay
            setTimeout(() => this.processQueue(), this.delayBetweenRequests);
          });

        // Small delay between starting requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.processing = false;
  }
}

// Global request queue instance
export const globalRequestQueue = new RequestQueue();