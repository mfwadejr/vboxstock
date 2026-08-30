FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/mfwadejr/vboxstock"
LABEL org.opencontainers.image.description="Self-contained vSeeBox inventory and sales tracker"
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY vboxstock-entrypoint.sh /usr/local/bin/vboxstock-entrypoint
RUN apk add --no-cache su-exec \
    && chmod +x /usr/local/bin/vboxstock-entrypoint \
    && mkdir -p /data
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production PUID=99 PGID=100
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/vboxstock-entrypoint"]
CMD ["node", "server.mjs"]
