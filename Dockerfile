FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN chmod -R u+rwX,go+rX /app
ENV PORT=4000
USER node
EXPOSE 4000
CMD ["node", "serve.js"]
