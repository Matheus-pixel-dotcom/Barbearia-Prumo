# Style Relo Barber — imagem do servidor (site + API + banco de clientes)
# Funciona em qualquer host que aceite Docker: Render, Railway, Fly.io, Koyeb, VPS...
FROM node:20-alpine

WORKDIR /app

# O projeto não tem dependências para instalar: usa só os recursos nativos do Node.
COPY . .

# Pasta onde o banco de dados em arquivo é gravado (use um volume para persistir)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8000
ENV RELO_DATA_DIR=/app/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server.js"]
