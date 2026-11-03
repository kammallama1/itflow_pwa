FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
COPY itflow_pwa/package*.json ./
RUN npm ci
COPY itflow_pwa/tsconfig.json itflow_pwa/index.html ./
COPY itflow_pwa/src ./src
COPY itflow_pwa/public ./public
RUN npm run build
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY itflow_pwa/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node itflow_pwa/connections.mjs itflow_pwa/scoped-push.mjs itflow_pwa/cli.mjs itflow_pwa/server.mjs itflow_pwa/push.mjs itflow_pwa/events.mjs itflow_pwa/inventory.mjs itflow_pwa/ticket-actions.mjs itflow_pwa/administration.mjs itflow_pwa/email.mjs itflow_pwa/calendar.mjs itflow_pwa/microsoft-calendar.mjs itflow_pwa/local-auth.mjs itflow_pwa/local-auth-store.mjs itflow_pwa/account-security.mjs ./
COPY LICENSE CREDITS.md THIRD_PARTY_NOTICES.md ./
COPY itflow_pwa/THIRD_PARTY_LICENSES ./THIRD_PARTY_LICENSES
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
