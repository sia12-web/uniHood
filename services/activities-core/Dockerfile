FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma compatibility
RUN apk add --no-cache openssl openssl-dev libc6-compat

# Install dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL for Prisma compatibility
RUN apk add --no-cache openssl openssl-dev

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy generated prisma client from builder
# We need to copy both .prisma (where the client engine lives) and @prisma (where the types/index live)
# although @prisma/client is in package.json, so npm ci installed it.
# However, the generated client code inside .prisma is needed.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

CMD ["npm", "start"]
