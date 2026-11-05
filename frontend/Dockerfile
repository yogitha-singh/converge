# Development image (Vite dev server with hot reload). See Dockerfile.prod for the production build.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
