# =====================================================================
# Frontend: Vite/React-App bauen und als statische SPA über nginx ausliefern.
# nginx proxyt zusätzlich /auth/v1 und /rest/v1 auf denselben Origin -> die
# App spricht Supabase unter ihrer eigenen URL an (kein CORS, kein Extra-Gateway).
# Build-Kontext ist ./frontend; der Quellcode wird NICHT verändert.
# =====================================================================
ARG NODE_VERSION=20
ARG NGINX_VERSION=1.27

# ---------- Build-Stage ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Deterministische Installation aus package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite ersetzt import.meta.env.VITE_* zur Build-Zeit. Werte aus Compose-Build-Args
# in eine .env.production schreiben, damit Vite sie zuverlässig einliest.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Optionaler Default für den Entra-Benutzer-Sync (leer = in der App zu setzen).
ARG VITE_ENTRA_GROUP_NAME
ARG VITE_ENTRA_GROUP_ID
RUN printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\nVITE_ENTRA_GROUP_NAME=%s\nVITE_ENTRA_GROUP_ID=%s\n' \
      "$VITE_SUPABASE_URL" "$VITE_SUPABASE_ANON_KEY" "$VITE_ENTRA_GROUP_NAME" "$VITE_ENTRA_GROUP_ID" > .env.production \
    && npm run build

# ---------- Runtime-Stage ----------
# Die nginx-Konfiguration wird per Compose-Volume eingehängt (docker/frontend/nginx.conf),
# da sie ausserhalb des Build-Kontexts (./frontend) liegt.
FROM nginx:${NGINX_VERSION}-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
