###############################################################################
# Stage 1: build the static site with parcel
###############################################################################
FROM node:22.22.2-slim AS build

WORKDIR /app

# Copy package files first so this layer is cached unless they change
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and build the static production bundle
COPY . .
RUN npm run build

###############################################################################
# Stage 2: serve the static build with nginx
###############################################################################
FROM nginx:1.27-alpine AS production

# Copy only the built static files into nginx's default document root
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
