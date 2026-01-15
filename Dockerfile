FROM node:22.22.0

RUN npm install -g pnpm

WORKDIR /usr/src/app

COPY pnpm-lock.yaml* package.json ./

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate && pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
