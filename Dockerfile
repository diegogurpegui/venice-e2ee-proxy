# Clones venice-e2ee-proxy from GitHub at a pinned ref (branch, tag, or full commit SHA).
# Default ref is a fixed commit, not a moving branch — override VENICE_PROXY_REF only when you intend to upgrade.
FROM node:22-alpine AS builder
WORKDIR /app

ARG VENICE_PROXY_REPO=https://github.com/diegogurpegui/venice-e2ee-proxy.git
ARG VENICE_PROXY_REF=9edb944bd478b66460994a40b279c2e4f2200e09

RUN apk add --no-cache git \
  && git clone "${VENICE_PROXY_REPO}" /app \
  && cd /app \
  && git checkout "${VENICE_PROXY_REF}" \
  && git submodule update --init --recursive

RUN cd venice-e2ee && npm ci && npm run build
RUN npm ci && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/venice-e2ee/package.json /app/venice-e2ee/package-lock.json ./venice-e2ee/
COPY --from=builder /app/venice-e2ee/dist ./venice-e2ee/dist
RUN npm ci --omit=dev && npm cache clean --force

USER node
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
