ARG BASE_IMAGE=node:22-alpine

FROM ${BASE_IMAGE} AS build

WORKDIR /tmp/websocket-server

ADD . /tmp/websocket-server

RUN npm install && \
	npm run build

FROM ${BASE_IMAGE}

WORKDIR /app

COPY --from=build /tmp/websocket-server/dist/ /app/
COPY --from=build /tmp/websocket-server/package.json /app/package.json

RUN npm install --production

CMD ["node", "index.js"]
