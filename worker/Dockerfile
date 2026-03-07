FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Default: sync 90 days
CMD ["node", "apple-ads-sync.js", "90"]
