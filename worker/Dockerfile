FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Default: sync last 7 days (incremental)
# For full historical sync: docker run ... node apple-ads-sync.js 90
CMD ["node", "apple-ads-sync.js", "7"]
