# frontend/Dockerfile
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# optional: copy custom nginx.conf if you want
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
