FROM node:10.23.1-alpine3.10

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY kingpower/package.json /usr/src/app/package.json

RUN npm install pm2 -g
RUN npm install

COPY kingpower/. /usr/src/app

CMD [ "pm2-runtime", "start", "ecosystem.config.js" ]