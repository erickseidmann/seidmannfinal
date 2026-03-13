FROM node:18-bullseye-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build
CMD ["npm", "start"]
