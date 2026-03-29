FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "until npm run db:migrate; do echo 'Waiting for database...'; sleep 2; done && npm run db:seed && npm run start"]
