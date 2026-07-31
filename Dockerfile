# ---- Build stage: compile the Angular app ----
FROM node:24-alpine AS build

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle
COPY . .
RUN npm run build

# ---- Runtime stage: serve the static files with nginx ----
FROM nginx:alpine

# http-context map for WebSocket Connection header (loaded before default.conf)
COPY nginx-map.conf /etc/nginx/conf.d/00-map.conf

# SPA-aware server config (routing fallback + cache headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Angular's application builder emits the browser bundle here
COPY --from=build /app/dist/angular-app/browser /usr/share/nginx/html

# Static "coming soon" placeholder page — NOT part of the Angular SPA build
# (lives outside src/, so `npm run build` never touches it). Served by nginx
# from a path outside the SPA doc root; platform-engineer wires nginx.conf to
# hand this out at dorent.am/www.dorent.am while the real app moves to
# app.dorent.am behind Cloudflare Access.
COPY coming-soon/index.html /usr/share/nginx/coming-soon/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
