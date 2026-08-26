FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
ENV NODE_ENV=production PORT=9000 HOST=0.0.0.0
EXPOSE 9000
CMD ["node", "server.js"]
