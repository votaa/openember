# OpenEmber only. Ollama stays native on the macOS host.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS react
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node src/data/copilotPrompt.js ./src/data/copilotPrompt.js
COPY --chown=node:node shared/copilot/contract.schema.json shared/copilot/policy.json ./shared/copilot/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

FROM python:3.11-slim AS streamlit
WORKDIR /app
COPY streamlit/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home app
COPY --chown=app:app streamlit ./streamlit
COPY --chown=app:app config ./config
COPY --chown=app:app shared/copilot/contract.schema.json shared/copilot/policy.json ./shared/copilot/
USER app
EXPOSE 8501
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health', timeout=2)"
CMD ["streamlit", "run", "streamlit/app.py", "--server.address=0.0.0.0", "--server.headless=true", "--browser.gatherUsageStats=false"]
