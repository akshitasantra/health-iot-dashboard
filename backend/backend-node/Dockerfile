FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
COPY prisma ./prisma/
RUN npm ci --production=false
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/server.js"]
