# =====================================================================
# Mail-Sender-Dienst (Microsoft Graph, App-only) + Reminder-Scheduler.
# Build-Kontext ist ./mailer. Die Templates liegen NICHT im Image, sondern werden
# per Compose-Volume aus ./mail-templates gemountet (Pflege ohne Rebuild).
# =====================================================================
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY . .

# Interner Port (nur im Compose-Netz; nginx proxyt /mail/ hierher).
EXPOSE 8025
CMD ["node", "index.js"]
