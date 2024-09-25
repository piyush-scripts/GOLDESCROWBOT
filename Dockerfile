# Use Node.js 18 Alpine image as the base
FROM node:18-alpine AS base

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and yarn.lock (if present) into the container
COPY package.json yarn.lock* ./

# Install dependencies
RUN yarn install

# Copy Prisma files
COPY /prisma ./prisma

# Copy the rest of the application code
COPY . .

# Run Prisma commands to migrate and generate client

# Expose the application port (3000) and Prisma Studio port (5555)
EXPOSE 3000 5555

# Start the application using nodemon for hot reloading
CMD ["yarn", "dev"]
