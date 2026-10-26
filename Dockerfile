FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4100 4101 4102 4103 4104 4105 4106
CMD ["npm", "start"]
