FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=4000
EXPOSE 4000
CMD ["node", "serve.js"]
