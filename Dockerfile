FROM node:18-alpine AS base

WORKDIR /usr/src/app

COPY ./package.json .

RUN yarn install

COPY . .

EXPOSE 3000

CMD [ "yarn", "dev" ]