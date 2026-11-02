FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json index.html ./
COPY src ./src
COPY public ./public
RUN npm run build
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node connections.mjs scoped-push.mjs cli.mjs server.mjs push.mjs events.mjs inventory.mjs ticket-actions.mjs administration.mjs email.mjs calendar.mjs microsoft-calendar.mjs local-auth.mjs local-auth-store.mjs account-security.mjs ./
COPY LICENSE CREDITS.md THIRD_PARTY_NOTICES.md ./
COPY THIRD_PARTY_LICENSES ./THIRD_PARTY_LICENSES
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
