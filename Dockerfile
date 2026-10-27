FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4200 4201 4202 4203 4204 4205 4206
CMD ["npm", "start"]
